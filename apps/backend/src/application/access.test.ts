import { beforeEach, describe, expect, it } from "vitest"

import { DAY, HOUR, MINUTE, TRIAL_DURATION } from "../domain"
import { AccessService } from "./access"
import { AppError } from "./errors"
import {
  FakeClock,
  FakeLearnHouse,
  FakeMailer,
  InMemoryAccounts,
  InMemoryPurchases,
  InMemoryStudentCodes,
  InMemoryTrials,
} from "./testing/fakes"

let clock: FakeClock
let accounts: InMemoryAccounts
let purchases: InMemoryPurchases
let trials: InMemoryTrials
let learnhouse: FakeLearnHouse
let codes: InMemoryStudentCodes
let mailer: FakeMailer
let access: AccessService

beforeEach(() => {
  clock = new FakeClock()
  accounts = new InMemoryAccounts()
  purchases = new InMemoryPurchases()
  trials = new InMemoryTrials()
  learnhouse = new FakeLearnHouse()
  codes = new InMemoryStudentCodes()
  mailer = new FakeMailer()
  access = new AccessService({ accounts, purchases, trials, learnhouse, codes, mailer, clock })
  accounts.add({ id: "u1", email: "Jane@Example.com" })
})

const rejection = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => (error instanceof AppError ? { code: error.code, status: error.status } : error)
  )

describe("me", () => {
  it("returns the account with no access and a Trial available", async () => {
    const me = await access.me("u1")
    expect(me).toEqual({
      account: { id: "u1", email: "Jane@Example.com", name: "u1", image: null, role: "user" },
      entitlement: { kind: "none", trialAvailable: true },
      studentEmail: null,
      checkedAt: clock.now(),
    })
  })

  it("matches a student by lowercased Google email and links it", async () => {
    learnhouse.members.add("jane@example.com")
    const me = await access.me("u1")
    expect(me.entitlement.kind).toBe("student")
    expect(me.studentEmail).toBe("jane@example.com")
    expect((await accounts.find("u1"))!.access).toMatchObject({
      studentEmail: "jane@example.com",
      studentMember: true,
      studentCheckedAt: clock.now(),
    })
  })

  it("does not match a Google email already linked to another account", async () => {
    learnhouse.members.add("jane@example.com")
    accounts.add({ id: "u2", access: { studentEmail: "jane@example.com" } })
    const me = await access.me("u1")
    expect(me.entitlement.kind).toBe("none")
    expect(me.studentEmail).toBeNull()
  })

  it("checks a linked student email rather than the Google one", async () => {
    await accounts.updateAccess("u1", { studentEmail: "other@school.fr" })
    learnhouse.members.add("other@school.fr")
    expect((await access.me("u1")).entitlement.kind).toBe("student")
    expect(learnhouse.calls).toEqual(["other@school.fr"])
  })

  it("rechecks a member only after 24 h", async () => {
    learnhouse.members.add("jane@example.com")
    await access.me("u1")
    clock.advance(23 * HOUR)
    await access.me("u1")
    expect(learnhouse.calls).toHaveLength(1)
    clock.advance(HOUR)
    learnhouse.members.clear()
    expect((await access.me("u1")).entitlement.kind).toBe("none")
    expect(learnhouse.calls).toHaveLength(2)
  })

  it("keeps a membership for 72 h while LearnHouse is down", async () => {
    learnhouse.members.add("jane@example.com")
    await access.me("u1")
    learnhouse.down = true
    clock.advance(71 * HOUR)
    expect((await access.me("u1")).entitlement.kind).toBe("student")
    clock.advance(HOUR)
    expect((await access.me("u1")).entitlement.kind).toBe("none")
  })

  it("does not ask LearnHouse for a paid account or an override", async () => {
    purchases.rows.push({ userId: "u1", checkoutSessionId: "cs", paymentIntentId: "pi", amount: 9900, currency: "eur", status: "paid" })
    expect((await access.me("u1")).entitlement.kind).toBe("paid")
    await accounts.updateAccess("u1", { override: "revoke" })
    purchases.rows.length = 0
    expect((await access.me("u1")).entitlement.kind).toBe("none")
    expect(learnhouse.calls).toEqual([])
  })

  it("is unauthorized for an unknown account", async () => {
    expect(await rejection(access.me("nope"))).toEqual({ code: "unauthorized", status: 401 })
  })
})

describe("startTrial", () => {
  it("starts a 3-day Trial", async () => {
    const entitlement = await access.startTrial("u1", "42")
    expect(entitlement).toEqual({ kind: "trial", trialEndsAt: clock.now() + TRIAL_DURATION, trialAvailable: false })
    expect(trials.rows.get("42")).toEqual({ userId: "u1", startedAt: clock.now() })
  })

  it("is idempotent for the same X account", async () => {
    const first = await access.startTrial("u1", "42")
    clock.advance(DAY)
    expect(await access.startTrial("u1", "42")).toEqual(first)
  })

  it("refuses a second Trial with another X account", async () => {
    await access.startTrial("u1", "42")
    expect(await rejection(access.startTrial("u1", "43"))).toEqual({ code: "trial_used", status: 409 })
  })

  it("refuses an X account already used by another Google account", async () => {
    accounts.add({ id: "u2" })
    await access.startTrial("u2", "42")
    expect(await rejection(access.startTrial("u1", "42"))).toEqual({ code: "trial_used", status: 409 })
    expect((await accounts.find("u1"))!.access.trialStartedAt).toBeNull()
  })

  it("returns the current access to a student without burning the Trial", async () => {
    await accounts.updateAccess("u1", { studentMember: true, studentCheckedAt: clock.now() })
    expect(await access.startTrial("u1", "42")).toEqual({ kind: "student", trialAvailable: true })
    expect(trials.rows.size).toBe(0)
  })

  it("starts nothing for a revoked account", async () => {
    await accounts.updateAccess("u1", { override: "revoke" })
    expect((await access.startTrial("u1", "42")).kind).toBe("none")
    expect(trials.rows.size).toBe(0)
  })

  it("an ended Trial stays ended", async () => {
    await access.startTrial("u1", "42")
    clock.advance(TRIAL_DURATION)
    expect((await access.startTrial("u1", "42")).kind).toBe("none")
  })
})

describe("student link by purchase email", () => {
  beforeEach(() => {
    learnhouse.members.add("student@school.fr")
  })

  const linkedEmail = async (userId = "u1") => (await accounts.find(userId))!.access.studentEmail

  it("emails a 6-digit code, then links the email once the code is entered", async () => {
    expect(await access.requestStudentCode("u1", " Student@School.fr ")).toEqual({
      email: "student@school.fr",
      expiresAt: clock.now() + 15 * MINUTE,
    })
    expect(mailer.sent).toEqual([{ to: "student@school.fr", code: expect.stringMatching(/^\d{6}$/) }])
    expect(await linkedEmail()).toBeNull()

    const me = await access.verifyStudentCode("u1", mailer.lastCode()!)
    expect(me.entitlement.kind).toBe("student")
    expect(me.studentEmail).toBe("student@school.fr")
    expect(codes.rows.size).toBe(0)
  })

  it("stores only a hash of the code", async () => {
    await access.requestStudentCode("u1", "student@school.fr")
    const pending = codes.rows.get("u1")!
    expect(pending.codeHash).not.toContain(mailer.lastCode())
    expect(pending.codeHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it("404 without sending anything when the email is not a Growth Boost member", async () => {
    expect(await rejection(access.requestStudentCode("u1", "nope@school.fr"))).toEqual({ code: "student_not_found", status: 404 })
    expect(mailer.sent).toEqual([])
  })

  it("409 without sending anything when another account holds the email", async () => {
    accounts.add({ id: "u2", access: { studentEmail: "student@school.fr" } })
    expect(await rejection(access.requestStudentCode("u1", "student@school.fr"))).toEqual({ code: "student_email_taken", status: 409 })
    expect(mailer.sent).toEqual([])
  })

  it("409 when another account linked the email while the code was pending", async () => {
    await access.requestStudentCode("u1", "student@school.fr")
    accounts.add({ id: "u2", access: { studentEmail: "student@school.fr" } })
    expect(await rejection(access.verifyStudentCode("u1", mailer.lastCode()!))).toEqual({ code: "student_email_taken", status: 409 })
    expect(await linkedEmail()).toBeNull()
  })

  it("409 once the account is linked: the email can't be changed", async () => {
    await access.requestStudentCode("u1", "student@school.fr")
    await access.verifyStudentCode("u1", mailer.lastCode()!)
    expect(await rejection(access.requestStudentCode("u1", "other@school.fr"))).toEqual({ code: "student_already_linked", status: 409 })
  })

  it("refuses a wrong code, and drops the code after 5 wrong ones", async () => {
    await access.requestStudentCode("u1", "student@school.fr")
    const code = mailer.lastCode()!
    const wrong = code === "000000" ? "111111" : "000000"
    for (let i = 0; i < 5; i++) {
      expect(await rejection(access.verifyStudentCode("u1", wrong))).toEqual({ code: "student_code_invalid", status: 400 })
    }
    expect(await rejection(access.verifyStudentCode("u1", code))).toEqual({ code: "student_code_invalid", status: 400 })
    expect(await linkedEmail()).toBeNull()
  })

  it("refuses an expired code, and a code without a request", async () => {
    expect(await rejection(access.verifyStudentCode("u1", "123456"))).toEqual({ code: "student_code_invalid", status: 400 })
    await access.requestStudentCode("u1", "student@school.fr")
    clock.advance(15 * MINUTE)
    expect(await rejection(access.verifyStudentCode("u1", mailer.lastCode()!))).toEqual({ code: "student_code_invalid", status: 400 })
  })

  it("a new request replaces the previous code", async () => {
    await access.requestStudentCode("u1", "student@school.fr")
    const first = mailer.lastCode()!
    await access.requestStudentCode("u1", "student@school.fr")
    if (first !== mailer.lastCode()) {
      expect(await rejection(access.verifyStudentCode("u1", first))).toEqual({ code: "student_code_invalid", status: 400 })
    }
    expect((await access.verifyStudentCode("u1", mailer.lastCode()!)).studentEmail).toBe("student@school.fr")
  })

  it("429 after 5 code requests in an hour, before asking LearnHouse", async () => {
    for (let i = 0; i < 5; i++) await access.requestStudentCode("u1", "student@school.fr")
    expect(await rejection(access.requestStudentCode("u1", "student@school.fr"))).toEqual({ code: "student_link_limit", status: 429 })
    expect(learnhouse.calls).toHaveLength(5)
    expect(mailer.sent).toHaveLength(5)
    clock.advance(HOUR)
    await access.requestStudentCode("u1", "student@school.fr")
  })

  it("502 when LearnHouse or Resend is down", async () => {
    learnhouse.down = true
    expect(await rejection(access.requestStudentCode("u1", "student@school.fr"))).toEqual({ code: "upstream_unavailable", status: 502 })
    learnhouse.down = false
    mailer.down = true
    expect(await rejection(access.requestStudentCode("u1", "student@school.fr"))).toEqual({ code: "upstream_unavailable", status: 502 })
    expect(codes.rows.size).toBe(0)
  })
})

describe("ActiveBrowser", () => {
  it("registers, then rejects another browser until it signs in", async () => {
    await access.registerBrowser("u1", "b1")
    await access.checkBrowser("u1", "b1")
    await access.registerBrowser("u1", "b2")
    expect(await rejection(access.checkBrowser("u1", "b1"))).toEqual({ code: "browser_replaced", status: 409 })
    await access.checkBrowser("u1", "b2")
  })

  it("429 after 3 changes in a week", async () => {
    for (const id of ["b0", "b1", "b2", "b3"]) await access.registerBrowser("u1", id)
    expect(await rejection(access.registerBrowser("u1", "b4"))).toEqual({ code: "browser_change_limit", status: 429 })
    await access.registerBrowser("u1", "b3")
    clock.advance(7 * DAY)
    await access.registerBrowser("u1", "b4")
  })
})
