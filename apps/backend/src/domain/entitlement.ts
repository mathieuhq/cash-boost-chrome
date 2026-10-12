import type { Entitlement } from "@super-x/contracts"

import { DAY } from "./time"

/** SPEC: a Trial lasts 3 days. */
export const TRIAL_DURATION = 3 * DAY

export type AccessOverride = "grant" | "revoke"

/** Everything the Entitlement depends on, already resolved (student membership included). */
export interface AccessFacts {
  override: AccessOverride | null
  paid: boolean
  studentMember: boolean
  trialStartedAt: number | null
}

export function trialEndsAt(startedAt: number): number {
  return startedAt + TRIAL_DURATION
}

/** Precedence: admin override, then purchase, then student, then a running Trial. */
export function computeEntitlement(facts: AccessFacts, now: number): Entitlement {
  const trialAvailable = facts.trialStartedAt === null
  if (facts.override === "revoke") return { kind: "none", trialAvailable: false }
  if (facts.override === "grant") return { kind: "student", trialAvailable }
  if (facts.paid) return { kind: "paid", trialAvailable }
  if (facts.studentMember) return { kind: "student", trialAvailable }
  if (facts.trialStartedAt === null) return { kind: "none", trialAvailable }
  const endsAt = trialEndsAt(facts.trialStartedAt)
  return { kind: endsAt > now ? "trial" : "none", trialEndsAt: endsAt, trialAvailable }
}
