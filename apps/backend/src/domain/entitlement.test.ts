import { describe, expect, it } from "vitest"

import { computeEntitlement, TRIAL_DURATION, type AccessFacts } from "./entitlement"

const now = 1_800_000_000_000
const facts = (patch: Partial<AccessFacts> = {}): AccessFacts => ({
  override: null,
  paid: false,
  studentMember: false,
  trialStartedAt: null,
  ...patch,
})

describe("computeEntitlement", () => {
  it("is none with a Trial available for a new account", () => {
    expect(computeEntitlement(facts(), now)).toEqual({ kind: "none", trialAvailable: true })
  })

  it("revoke beats everything and offers no Trial", () => {
    expect(computeEntitlement(facts({ override: "revoke", paid: true, studentMember: true }), now)).toEqual({
      kind: "none",
      trialAvailable: false,
    })
  })

  it("grant gives student access", () => {
    expect(computeEntitlement(facts({ override: "grant" }), now).kind).toBe("student")
  })

  it("a paid purchase beats student membership", () => {
    expect(computeEntitlement(facts({ paid: true, studentMember: true }), now).kind).toBe("paid")
  })

  it("a member is a student", () => {
    expect(computeEntitlement(facts({ studentMember: true }), now).kind).toBe("student")
  })

  it("a running Trial ends 3 days after it started", () => {
    const startedAt = now - 1_000
    expect(computeEntitlement(facts({ trialStartedAt: startedAt }), now)).toEqual({
      kind: "trial",
      trialEndsAt: startedAt + TRIAL_DURATION,
      trialAvailable: false,
    })
  })

  it("an ended Trial is none but keeps its end date", () => {
    const startedAt = now - TRIAL_DURATION
    expect(computeEntitlement(facts({ trialStartedAt: startedAt }), now)).toEqual({
      kind: "none",
      trialEndsAt: now,
      trialAvailable: false,
    })
  })

  it("a student who used a Trial has no Trial available", () => {
    expect(computeEntitlement(facts({ studentMember: true, trialStartedAt: now }), now).trialAvailable).toBe(false)
  })
})
