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

/** SPEC defaults; the Config may lower or raise them per tier. */
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

/** The first days are gentler: limits rise from `startFraction` of their value to all of it over `days`. */
export interface RampUp {
  days: number
  startFraction: number
}

/** Share of the limits allowed at `now`, given when the account's first Action went out. */
export function rampFraction(firstActionAt: number | undefined, now: number, ramp: RampUp): number {
  if (firstActionAt === undefined) return ramp.startFraction
  const days = Math.max(0, now - firstActionAt) / DAY
  return Math.min(1, ramp.startFraction + (1 - ramp.startFraction) * (days / ramp.days))
}

/** Day of the ramp, 1-based, for the panel. */
export function rampDay(firstActionAt: number | undefined, now: number): number {
  return firstActionAt === undefined ? 1 : Math.floor(Math.max(0, now - firstActionAt) / DAY) + 1
}

/**
 * The limits actually enforced: the base ones scaled by the ramp, and the daily ones (DMs, replies) by the
 * day's target so the account never stops on the same number every day. Never below 1.
 */
export function effectiveLimits(limits: QuotaLimits, ramp: number, dailyFactor: number): QuotaLimits {
  const scale = (value: number, factor: number) => (value === 0 ? 0 : Math.max(1, Math.ceil(value * factor)))
  return {
    dm: scale(limits.dm, ramp * dailyFactor),
    like: scale(limits.like, ramp),
    reply: scale(limits.reply, ramp * dailyFactor),
  }
}

export function pruneHistory(history: readonly ActionRecord[], now: number): ActionRecord[] {
  return history.filter((r) => r.at > now - DAY)
}
