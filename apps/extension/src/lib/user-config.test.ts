import { DEFAULT_CONFIG } from "@super-x/application"
import { describe, expect, it } from "vitest"

import { userConfig } from "./user-config"

describe("userConfig", () => {
  it("lays the user's hours and ramp-up over the bundled Config", () => {
    const config = userConfig(DEFAULT_CONFIG, { activeHours: { start: 10, end: 2 }, rampUp: { enabled: true, days: 14 } })
    expect(config.pacing.activeHours).toEqual({ ...DEFAULT_CONFIG.pacing.activeHours, start: 10, end: 2 })
    expect(config.volume.rampUp).toEqual({ ...DEFAULT_CONFIG.volume.rampUp, days: 14 })
  })

  it("turns the ramp-up off by starting at the full limits", () => {
    expect(userConfig(DEFAULT_CONFIG, { rampUp: { enabled: false, days: 7 } }).volume.rampUp.startFraction).toBe(1)
    expect(userConfig(DEFAULT_CONFIG, {})).toEqual(DEFAULT_CONFIG)
  })
})
