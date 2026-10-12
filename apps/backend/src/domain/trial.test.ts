import { describe, expect, it } from "vitest"

import { trialRequest } from "./trial"

describe("trialRequest", () => {
  it("starts when the account never had a Trial", () => {
    expect(trialRequest({ trialStartedAt: null, trialXUserId: null }, "1")).toBe("start")
  })

  it("is idempotent for the same X account", () => {
    expect(trialRequest({ trialStartedAt: 5, trialXUserId: "1" }, "1")).toBe("same")
  })

  it("refuses another X account", () => {
    expect(trialRequest({ trialStartedAt: 5, trialXUserId: "1" }, "2")).toBe("used")
  })
})
