import { describe, expect, it } from "vitest"

import { DEFAULT_LIMITS, hasQuota, pruneHistory, quotaUsage, type ActionRecord } from "./quota"

const MIN = 60_000
const HOUR = 60 * MIN
const now = 10 * 24 * HOUR

const records = (kind: ActionRecord["kind"], count: number, ago: number): ActionRecord[] =>
  Array.from({ length: count }, () => ({ kind, at: now - ago }))

describe("quotas (SPEC: anti-ban guards)", () => {
  it("free accounts get 20 DMs a day, premium 60, both 30 likes an hour and 100 replies a day", () => {
    expect(DEFAULT_LIMITS.free).toEqual({ dm: 20, like: 30, reply: 100 })
    expect(DEFAULT_LIMITS.premium).toEqual({ dm: 60, like: 30, reply: 100 })
  })

  it("counts DMs and replies over the last 24 h and likes over the last hour", () => {
    const history = [...records("dm", 3, 23 * HOUR), ...records("dm", 5, 25 * HOUR), ...records("like", 2, 30 * MIN), ...records("like", 4, 2 * HOUR), ...records("reply", 7, HOUR)]
    expect(quotaUsage(history, now, DEFAULT_LIMITS.free)).toEqual({
      dm: { used: 3, limit: 20 },
      like: { used: 2, limit: 30 },
      reply: { used: 7, limit: 100 },
    })
  })

  it("refuses an action once its ceiling is reached", () => {
    const history = records("dm", 20, HOUR)
    expect(hasQuota("dm", history, now, DEFAULT_LIMITS.free)).toBe(false)
    expect(hasQuota("dm", history, now, DEFAULT_LIMITS.premium)).toBe(true)
    expect(hasQuota("like", history, now, DEFAULT_LIMITS.free)).toBe(true)
  })

  it("prunes records older than a day", () => {
    const history = [...records("dm", 1, 25 * HOUR), ...records("dm", 1, 2 * HOUR)]
    expect(pruneHistory(history, now)).toHaveLength(1)
  })
})
