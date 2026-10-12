import { DEFAULT_REMOTE_CONFIG, RemoteConfig, type ErrorReport } from "@super-x/contracts"

import type { ConfigRepository, ConfigVersion, ErrorCountRow, ErrorCounts } from "./ports"

const EditableConfig = RemoteConfig.omit({ version: true })

export type SaveConfigResult = { ok: true; config: RemoteConfig } | { ok: false; issues: string[] }

/** RemoteConfig (versioned, edited by admins) and the error codes reported against each version. */
export class ConfigService {
  constructor(
    private readonly configs: ConfigRepository,
    private readonly errors: ErrorCounts
  ) {}

  async current(): Promise<RemoteConfig> {
    return (await this.configs.latest()) ?? DEFAULT_REMOTE_CONFIG
  }

  /** Any `version` in the input is ignored: the server assigns the next one. */
  async save(input: unknown, createdBy: string): Promise<SaveConfigResult> {
    const parsed = EditableConfig.safeParse(input)
    if (!parsed.success) {
      return { ok: false, issues: parsed.error.issues.map((issue) => `${issue.path.join(".") || "(racine)"} : ${issue.message}`) }
    }
    return { ok: true, config: await this.configs.save(parsed.data, createdBy) }
  }

  history(limit = 20): Promise<ConfigVersion[]> {
    return this.configs.history(limit)
  }

  async reportErrors(report: ErrorReport): Promise<void> {
    const counts = new Map<string, number>()
    for (const { code, count } of report.codes) counts.set(code, (counts.get(code) ?? 0) + count)
    if (counts.size === 0) return
    await this.errors.add(
      report.configVersion,
      report.extensionVersion,
      [...counts].map(([code, count]) => ({ code, count }))
    )
  }

  errorCounts(): Promise<ErrorCountRow[]> {
    return this.errors.list()
  }
}
