import { describe, expect, it } from "vitest"

import { utcDay } from "./time"

describe("utcDay", () => {
  it("uses the UTC calendar day", () => {
    expect(utcDay(Date.UTC(2026, 9, 11, 23, 59, 59))).toBe("2026-10-11")
    expect(utcDay(Date.UTC(2026, 9, 12, 0, 0, 0))).toBe("2026-10-12")
  })
})
