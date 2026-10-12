import { describe, expect, it } from "vitest"

import {
  LINK_ATTEMPT_WINDOW,
  linkAttempt,
  MAX_LINK_ATTEMPTS,
  normalizeEmail,
  STUDENT_RECHECK_AFTER,
  STUDENT_TOLERANCE,
  studentCheckDue,
  trustedMember,
} from "./student"

const now = 1_800_000_000_000
const member = (checkedAgo: number) => ({ studentEmail: "a@b.c", studentMember: true, studentCheckedAt: now - checkedAgo })

describe("student rules", () => {
  it("rechecks non-members every time and members after 24 h", () => {
    expect(studentCheckDue({ studentEmail: null, studentMember: false, studentCheckedAt: now }, now)).toBe(true)
    expect(studentCheckDue(member(STUDENT_RECHECK_AFTER - 1), now)).toBe(false)
    expect(studentCheckDue(member(STUDENT_RECHECK_AFTER), now)).toBe(true)
  })

  it("trusts a membership for 72 h", () => {
    expect(trustedMember(member(STUDENT_TOLERANCE - 1), now)).toBe(true)
    expect(trustedMember(member(STUDENT_TOLERANCE), now)).toBe(false)
    expect(trustedMember({ studentEmail: null, studentMember: true, studentCheckedAt: null }, now)).toBe(false)
  })

  it("normalizes emails", () => {
    expect(normalizeEmail("  Jane.Doe@Gmail.COM ")).toBe("jane.doe@gmail.com")
  })

  it("allows 5 link attempts per rolling hour", () => {
    let attempts: number[] = []
    for (let i = 0; i < MAX_LINK_ATTEMPTS; i++) attempts = linkAttempt(attempts, now + i)!
    expect(linkAttempt(attempts, now + MAX_LINK_ATTEMPTS)).toBeNull()
    expect(linkAttempt(attempts, now + LINK_ATTEMPT_WINDOW)).toEqual([now + 1, now + 2, now + 3, now + 4, now + LINK_ATTEMPT_WINDOW])
  })
})
