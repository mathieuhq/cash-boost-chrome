/** An Action is one operation on X; every Action consumes Quota (CONTEXT.md). */
export type ActionKind = "like" | "dm" | "reply"
export type AccountTier = "free" | "premium"

export type QuotaLimits = Record<ActionKind, number>

export interface ActionRecord {
  kind: ActionKind
  at: number
}

export interface QuotaMeter {
  used: number
  limit: number
}

const HOUR = 3_600_000
const DAY = 24 * HOUR

/** Rolling windows: DMs and replies per day, likes per hour. */
export const QUOTA_WINDOW: Record<ActionKind, number> = { dm: DAY, like: HOUR, reply: DAY }

/** SPEC defaults; RemoteConfig may lower or raise them per tier. */
export const DEFAULT_LIMITS: Record<AccountTier, QuotaLimits> = {
  free: { dm: 20, like: 30, reply: 100 },
  premium: { dm: 60, like: 30, reply: 100 },
}

function used(kind: ActionKind, history: readonly ActionRecord[], now: number): number {
  const since = now - QUOTA_WINDOW[kind]
  return history.filter((r) => r.kind === kind && r.at > since).length
}

export function quotaUsage(history: readonly ActionRecord[], now: number, limits: QuotaLimits): Record<ActionKind, QuotaMeter> {
  return {
    dm: { used: used("dm", history, now), limit: limits.dm },
    like: { used: used("like", history, now), limit: limits.like },
    reply: { used: used("reply", history, now), limit: limits.reply },
  }
}

export function hasQuota(kind: ActionKind, history: readonly ActionRecord[], now: number, limits: QuotaLimits): boolean {
  return used(kind, history, now) < limits[kind]
}

export function pruneHistory(history: readonly ActionRecord[], now: number): ActionRecord[] {
  return history.filter((r) => r.at > now - DAY)
}
