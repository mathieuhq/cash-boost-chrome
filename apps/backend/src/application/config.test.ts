import { DEFAULT_REMOTE_CONFIG } from "@super-x/contracts"
import { beforeEach, describe, expect, it } from "vitest"

import { ConfigService } from "./config"
import { InMemoryConfigs, InMemoryErrorCounts } from "./testing/fakes"

let configs: InMemoryConfigs
let errors: InMemoryErrorCounts
let service: ConfigService

beforeEach(() => {
  configs = new InMemoryConfigs()
  errors = new InMemoryErrorCounts()
  service = new ConfigService(configs, errors)
})

describe("ConfigService", () => {
  it("serves the default config (version 0) until one is saved", async () => {
    expect(await service.current()).toEqual(DEFAULT_REMOTE_CONFIG)
  })

  it("assigns the version itself", async () => {
    const result = await service.save({ ...DEFAULT_REMOTE_CONFIG, version: 99, killSwitch: true }, "admin@x.fr")
    expect(result).toEqual({ ok: true, config: { ...DEFAULT_REMOTE_CONFIG, version: 1, killSwitch: true } })
    expect((await service.current()).version).toBe(1)
  })

  it("rejects an invalid config with readable issues", async () => {
    const result = await service.save({ ...DEFAULT_REMOTE_CONFIG, thresholds: { accept: 2, review: 0.4 } }, "a")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues[0]).toContain("thresholds.accept")
  })

  it("sums reported error codes per config and extension version", async () => {
    await service.reportErrors({ configVersion: 1, extensionVersion: "0.1.0", codes: [{ code: "88", count: 2 }, { code: "88", count: 1 }] })
    await service.reportErrors({ configVersion: 1, extensionVersion: "0.1.0", codes: [{ code: "88", count: 4 }] })
    expect(await service.errorCounts()).toEqual([{ configVersion: 1, extensionVersion: "0.1.0", code: "88", count: 7 }])
  })
})
