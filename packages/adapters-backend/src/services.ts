import { ClassifierUnavailable, type Classifier, type Clock, type ConfigSource, type ErrorReporter } from "@super-x/application"
import {
  ClassifyResponse,
  DEFAULT_REMOTE_CONFIG,
  RemoteConfig,
  type ClassifyRequest,
  type ErrorReport,
} from "@super-x/contracts"
import * as z from "zod"

import { BackendError, KEYS, type BackendClient } from "./client"

const HOUR = 3_600_000

/** Jev through the backend proxy; the OpenRouter key never reaches the extension. */
export class BackendClassifier implements Classifier {
  constructor(private readonly client: BackendClient) {}

  async classify(keyword: string, comments: { id: string; text: string }[]) {
    try {
      const response = await this.client.request("/api/classify", ClassifyResponse, {
        body: { keyword, comments } satisfies ClassifyRequest,
      })
      return response.results
    } catch (error) {
      if (error instanceof BackendError && error.code === "classification_cap") throw new ClassifierUnavailable("cap")
      if (error instanceof BackendError && error.status === 401) throw new ClassifierUnavailable("unauthorized")
      throw new ClassifierUnavailable("unavailable")
    }
  }
}

interface CachedConfig {
  config: RemoteConfig
  fetchedAt: number
}

/** RemoteConfig cached for an hour; the last known (or default) config is used when offline. */
export class BackendConfig implements ConfigSource {
  constructor(
    private readonly client: BackendClient,
    private readonly clock: Clock,
    private readonly maxAge = HOUR
  ) {}

  async get(): Promise<RemoteConfig> {
    const cached = await this.client.kv.get<CachedConfig>(KEYS.config)
    const now = this.clock.now()
    if (cached && now - cached.fetchedAt < this.maxAge) return cached.config
    try {
      const config = await this.client.request("/api/config", RemoteConfig)
      await this.client.kv.set(KEYS.config, { config, fetchedAt: now } satisfies CachedConfig)
      return config
    } catch {
      return cached?.config ?? DEFAULT_REMOTE_CONFIG
    }
  }
}

/** Counts X error codes locally; `flush` sends them (no content, only codes) to the backend. */
export class BackendErrorReporter implements ErrorReporter {
  private pending = Promise.resolve()

  constructor(
    private readonly client: BackendClient,
    private readonly extensionVersion: string
  ) {}

  record(code: string): void {
    this.pending = this.pending.then(async () => {
      const counts = (await this.client.kv.get<Record<string, number>>(KEYS.errors)) ?? {}
      counts[code] = (counts[code] ?? 0) + 1
      await this.client.kv.set(KEYS.errors, counts)
    })
  }

  async flush(configVersion: number): Promise<void> {
    await this.pending
    const counts = (await this.client.kv.get<Record<string, number>>(KEYS.errors)) ?? {}
    const codes = Object.entries(counts).map(([code, count]) => ({ code, count }))
    if (codes.length === 0) return
    try {
      await this.client.request("/api/errors", z.object({ ok: z.literal(true) }), {
        body: { configVersion, extensionVersion: this.extensionVersion, codes: codes.slice(0, 50) } satisfies ErrorReport,
      })
      await this.client.kv.remove(KEYS.errors)
    } catch {
      // Kept for the next flush.
    }
  }
}
