import { HOUR, MINUTE } from "./time"

/** SPEC: membership rechecked every 24 h… */
export const STUDENT_RECHECK_AFTER = 24 * HOUR
/** …and still trusted for 72 h when LearnHouse can't be reached. */
export const STUDENT_TOLERANCE = 72 * HOUR

export interface StudentState {
  studentEmail: string | null
  studentMember: boolean
  studentCheckedAt: number | null
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** Non-members are rechecked every time (they may have just enrolled); members once a day. */
export function studentCheckDue(state: StudentState, now: number): boolean {
  return !state.studentMember || state.studentCheckedAt === null || now - state.studentCheckedAt >= STUDENT_RECHECK_AFTER
}

/** Membership as known without asking LearnHouse: a stale positive answer expires after 72 h. */
export function trustedMember(state: StudentState, now: number): boolean {
  return state.studentMember && state.studentCheckedAt !== null && now - state.studentCheckedAt < STUDENT_TOLERANCE
}

/**
 * At most 5 link attempts per rolling hour and Account: limits probing which emails bought
 * Growth Boost, and protects the LearnHouse token's quota (60 email lookups / min).
 */
export const MAX_LINK_ATTEMPTS = 5
export const LINK_ATTEMPT_WINDOW = HOUR

/** The attempts to store once this one is counted, or null when the limit is reached. */
export function linkAttempt(attempts: number[], now: number): number[] | null {
  const recent = attempts.filter((at) => now - at < LINK_ATTEMPT_WINDOW)
  return recent.length >= MAX_LINK_ATTEMPTS ? null : [...recent, now]
}

/** The emailed link code: valid 15 minutes, dropped after 5 wrong entries. */
export const STUDENT_CODE_TTL = 15 * MINUTE
export const MAX_CODE_FAILURES = 5
