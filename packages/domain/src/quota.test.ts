import { describe, expect, it } from "vitest"

import { DEFAULT_LIMITS, effectiveLimits, hasQuota, pruneHistory, quotaUsage, rampDay, rampFraction, type ActionRecord } from "./quota"

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

describe("ramp-up and daily target", () => {
  const ramp = { days: 7, startFraction: 0.4 }

  it("starts at the start fraction and reaches the full limits after the ramp", () => {
    expect(rampFraction(undefined, now, ramp)).toBe(0.4)
    expect(rampFraction(now, now, ramp)).toBe(0.4)
    expect(rampFraction(now - 3.5 * 24 * HOUR, now, ramp)).toBeCloseTo(0.7)
    expect(rampFraction(now - 7 * 24 * HOUR, now, ramp)).toBe(1)
    expect(rampFraction(now - 30 * 24 * HOUR, now, ramp)).toBe(1)
    expect(rampDay(undefined, now)).toBe(1)
    expect(rampDay(now - 2.5 * 24 * HOUR, now)).toBe(3)
  })

  it("scales the daily limits by the ramp and the day's target, likes by the ramp only, never below 1", () => {
    expect(effectiveLimits(DEFAULT_LIMITS.free, 0.4, 0.7)).toEqual({ dm: 6, like: 12, reply: 28 })
    expect(effectiveLimits(DEFAULT_LIMITS.free, 1, 1)).toEqual(DEFAULT_LIMITS.free)
    expect(effectiveLimits({ dm: 1, like: 1, reply: 0 }, 0.4, 0.7)).toEqual({ dm: 1, like: 1, reply: 0 })
  })
})
