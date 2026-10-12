import { describe, expect, it } from "vitest"

import { isAwake, nextWakeAt, skewedBetween, type ActiveHours } from "./pacing"

const HOURS: ActiveHours = { start: 8, end: 21, jitterMinutes: 45 }
const local = (hour: number, minute = 0) => new Date(2026, 9, 11, hour, minute).getTime()

describe("skewedBetween", () => {
  it("spans the range, short delays being far more common than long ones", () => {
    expect(skewedBetween(() => 0, [30, 120])).toBe(30)
    expect(skewedBetween(() => 0.999999, [30, 120])).toBe(120)
    expect(skewedBetween(() => 0.5, [30, 120])).toBeLessThan(75)
  })
})

describe("active hours", () => {
  it("is awake between start and end, in local time", () => {
    expect(isAwake(local(8), HOURS)).toBe(true)
    expect(isAwake(local(20, 59), HOURS)).toBe(true)
    expect(isAwake(local(21), HOURS)).toBe(false)
    expect(isAwake(local(3), HOURS)).toBe(false)
    expect(isAwake(local(7, 59), HOURS)).toBe(false)
  })

  it("handles a window across midnight and an all-day window", () => {
    const night: ActiveHours = { start: 22, end: 6, jitterMinutes: 0 }
    expect(isAwake(local(23), night)).toBe(true)
    expect(isAwake(local(3), night)).toBe(true)
    expect(isAwake(local(12), night)).toBe(false)
    expect(isAwake(local(3), { start: 0, end: 0, jitterMinutes: 0 })).toBe(true)
  })

  it("wakes up at the next start, later by a random jitter", () => {
    expect(nextWakeAt(local(3), HOURS, () => 0)).toBe(local(8))
    expect(nextWakeAt(local(3), HOURS, () => 0.999999)).toBe(local(8, 45))
    expect(nextWakeAt(local(23, 30), HOURS, () => 0)).toBe(new Date(2026, 9, 12, 8).getTime())
  })
})
