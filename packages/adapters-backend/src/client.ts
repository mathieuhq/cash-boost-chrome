import { ApiError, BROWSER_HEADER, type ApiErrorCode } from "@super-x/contracts"
import type * as z from "zod"

/** Minimal persistent key-value store (chrome.storage.local in the extension, a Map in tests). */
export interface KeyValue {
  get<T>(key: string): Promise<T | undefined>
  set(key: string, value: unknown): Promise<void>
  remove(key: string): Promise<void>
}

export interface Session {
  token: string
}

export const KEYS = {
  session: "auth:session",
  browserId: "auth:browserId",
  /** Set when another browser signed in: the panel explains why the user was signed out. */
  replaced: "auth:replaced",
  me: "backend:me",
  config: "backend:config",
  errors: "backend:errors",
} as const

export class BackendError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode | "network" | "bad_response"
  ) {
    super(`backend ${status} ${code}`)
    this.name = "BackendError"
  }
}

export interface BackendClientOptions {
  baseUrl: string
  kv: KeyValue
  fetch?: typeof fetch
  newId?: () => string
}

/** HTTP client of the Cash Boost backend: bearer session, browser id, zod-validated responses. */
export class BackendClient {
  readonly baseUrl: string
  readonly kv: KeyValue
  private readonly fetchImpl: typeof fetch
  private readonly newId: () => string

  constructor(options: BackendClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "")
    this.kv = options.kv
    this.fetchImpl = options.fetch ?? ((...args) => fetch(...args))
    this.newId = options.newId ?? (() => crypto.randomUUID())
  }

  async browserId(): Promise<string> {
    const existing = await this.kv.get<string>(KEYS.browserId)
    if (existing) return existing
    const id = this.newId()
    await this.kv.set(KEYS.browserId, id)
    return id
  }

  async session(): Promise<Session | undefined> {
    return this.kv.get<Session>(KEYS.session)
  }

  async signIn(token: string): Promise<void> {
    await this.kv.set(KEYS.session, { token } satisfies Session)
    await this.kv.remove(KEYS.replaced)
    await this.kv.remove(KEYS.me)
  }

  async signOut(): Promise<void> {
    const session = await this.session()
    await this.kv.remove(KEYS.session)
    await this.kv.remove(KEYS.me)
    if (session) {
      await this.fetchImpl(`${this.baseUrl}/api/auth/sign-out`, {
        method: "POST",
        headers: { authorization: `Bearer ${session.token}` },
      }).catch(() => undefined)
    }
  }

  /** Unauthenticated JSON POST (sign-in exchange). */
  async post<S extends z.ZodType>(path: string, schema: S, body: unknown): Promise<z.infer<S>> {
    let response: Response
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
    } catch {
      throw new BackendError(0, "network")
    }
    const json: unknown = await response.json().catch(() => undefined)
    if (!response.ok) {
      const parsed = ApiError.safeParse(json)
      throw new BackendError(response.status, parsed.success ? parsed.data.error : "bad_response")
    }
    const parsed = schema.safeParse(json)
    if (!parsed.success) throw new BackendError(response.status, "bad_response")
    return parsed.data
  }

  /** Authenticated JSON request. A 401 or a replaced browser signs the extension out. */
  async request<S extends z.ZodType>(path: string, schema: S, init: { method?: string; body?: unknown } = {}): Promise<z.infer<S>> {
    const session = await this.session()
    if (!session) throw new BackendError(401, "unauthorized")

    let response: Response
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: init.method ?? (init.body === undefined ? "GET" : "POST"),
        headers: {
          authorization: `Bearer ${session.token}`,
          [BROWSER_HEADER]: await this.browserId(),
          ...(init.body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      })
    } catch {
      throw new BackendError(0, "network")
    }

    const json: unknown = await response.json().catch(() => undefined)
    if (!response.ok) {
      const parsed = ApiError.safeParse(json)
      const code = parsed.success ? parsed.data.error : "bad_response"
      if (response.status === 401 || code === "browser_replaced") {
        await this.kv.remove(KEYS.session)
        await this.kv.remove(KEYS.me)
        if (code === "browser_replaced") await this.kv.set(KEYS.replaced, true)
      }
      throw new BackendError(response.status, code)
    }
    const parsed = schema.safeParse(json)
    if (!parsed.success) throw new BackendError(response.status, "bad_response")
    return parsed.data
  }
}
