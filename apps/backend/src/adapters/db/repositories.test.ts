import { DEFAULT_REMOTE_CONFIG } from "@super-x/contracts"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import type { Database } from "./database"
import { createPgliteDatabase } from "./pglite"
import {
  DrizzleAccounts,
  DrizzleConfigs,
  DrizzleErrorCounts,
  DrizzlePurchases,
  DrizzleStudentCodes,
  DrizzleTrials,
  DrizzleUsage,
} from "./repositories"
import * as schema from "./schema"

let db: Database
let close: () => Promise<void>

beforeAll(async () => {
  ;({ db, close } = await createPgliteDatabase())
})
afterAll(() => close())

beforeEach(async () => {
  for (const table of [schema.studentLinkCodes, schema.errorCounts, schema.remoteConfig, schema.classificationUsage, schema.purchases, schema.trials, schema.access, schema.user]) {
    await db.delete(table)
  }
  await db.insert(schema.user).values([
    { id: "u1", name: "Jane", email: "jane@example.com", createdAt: new Date(1_000) },
    { id: "u2", name: "John", email: "john@example.com", createdAt: new Date(2_000), role: "admin" },
  ])
})

describe("DrizzleAccounts", () => {
  it("finds a user without an access row", async () => {
    const accounts = new DrizzleAccounts(db)
    expect(await accounts.find("u1")).toEqual({
      id: "u1",
      email: "jane@example.com",
      name: "Jane",
      image: null,
      role: "user",
      createdAt: 1_000,
      access: {
        trialStartedAt: null,
        trialXUserId: null,
        override: null,
        studentEmail: null,
        studentMember: false,
        studentCheckedAt: null,
        studentLinkAttempts: [],
        activeBrowserId: null,
        browserChanges: [],
      },
    })
    expect(await accounts.find("ghost")).toBeNull()
  })

  it("upserts partial access patches", async () => {
    const accounts = new DrizzleAccounts(db)
    await accounts.updateAccess("u1", { activeBrowserId: "b1", browserChanges: [5, 6] })
    await accounts.updateAccess("u1", { studentMember: true, studentCheckedAt: 7_000, override: "grant" })
    await accounts.updateAccess("u1", { override: null })
    expect((await accounts.find("u1"))!.access).toMatchObject({
      activeBrowserId: "b1",
      browserChanges: [5, 6],
      studentMember: true,
      studentCheckedAt: 7_000,
      override: null,
    })
  })

  it("starts a Trial only once", async () => {
    const accounts = new DrizzleAccounts(db)
    expect(await accounts.startTrial("u1", "42", 10_000)).toBe(true)
    expect(await accounts.startTrial("u1", "43", 20_000)).toBe(false)
    expect((await accounts.find("u1"))!.access).toMatchObject({ trialStartedAt: 10_000, trialXUserId: "42" })
  })

  it("locks a student email to one account", async () => {
    const accounts = new DrizzleAccounts(db)
    await accounts.updateAccess("u1", { studentLinkAttempts: [1, 2] })
    expect(await accounts.linkStudent("u1", "eleve@ecole.fr", 5_000)).toBe(true)
    expect(await accounts.linkStudent("u1", "eleve@ecole.fr", 6_000)).toBe(true)
    expect(await accounts.linkStudent("u2", "eleve@ecole.fr", 7_000)).toBe(false)
    expect((await accounts.find("u1"))!.access).toMatchObject({
      studentEmail: "eleve@ecole.fr",
      studentMember: true,
      studentCheckedAt: 6_000,
      studentLinkAttempts: [1, 2],
    })
    expect((await accounts.find("u2"))!.access.studentEmail).toBeNull()
    expect(await accounts.studentEmailOwner("eleve@ecole.fr")).toBe("u1")
    expect(await accounts.studentEmailOwner("autre@ecole.fr")).toBeNull()

    await accounts.updateAccess("u1", { studentEmail: null })
    expect(await accounts.linkStudent("u2", "eleve@ecole.fr", 8_000)).toBe(true)
  })

  it("keeps one pending link code per account and counts failures", async () => {
    const codes = new DrizzleStudentCodes(db)
    expect(await codes.find("u1")).toBeNull()
    await codes.save("u1", { email: "a@ecole.fr", codeHash: "h1", expiresAt: 9_000, failures: 0 })
    expect(await codes.fail("u1")).toBe(1)
    expect(await codes.fail("u1")).toBe(2)
    expect(await codes.find("u1")).toEqual({ email: "a@ecole.fr", codeHash: "h1", expiresAt: 9_000, failures: 2 })
    await codes.save("u1", { email: "b@ecole.fr", codeHash: "h2", expiresAt: 10_000, failures: 0 })
    expect(await codes.find("u1")).toEqual({ email: "b@ecole.fr", codeHash: "h2", expiresAt: 10_000, failures: 0 })
    await codes.delete("u1")
    expect(await codes.find("u1")).toBeNull()
    expect(await codes.fail("u1")).toBe(0)
  })

  it("lists newest first and searches by email", async () => {
    const accounts = new DrizzleAccounts(db)
    expect((await accounts.list({ limit: 10 })).map((a) => [a.id, a.role])).toEqual([
      ["u2", "admin"],
      ["u1", "user"],
    ])
    expect((await accounts.list({ search: "JANE", limit: 10 })).map((a) => a.id)).toEqual(["u1"])
    expect(await accounts.list({ search: "%", limit: 10 })).toEqual([])
  })
})

describe("DrizzlePurchases", () => {
  it("records idempotently and refunds by payment intent", async () => {
    const purchases = new DrizzlePurchases(db)
    const paid = { userId: "u1", checkoutSessionId: "cs_1", paymentIntentId: "pi_1", amount: 9900, currency: "eur" }
    await purchases.recordPaid(paid)
    await purchases.recordPaid(paid)
    expect(await purchases.hasPaid("u1")).toBe(true)
    expect(await purchases.paidUserIds(["u1", "u2"])).toEqual(new Set(["u1"]))
    expect(await purchases.markRefunded("pi_1")).toBe(true)
    await purchases.recordPaid(paid)
    expect(await purchases.hasPaid("u1")).toBe(false)
    expect(await purchases.markRefunded("pi_unknown")).toBe(false)
  })
})

describe("DrizzleTrials", () => {
  it("keeps the first owner of an X account", async () => {
    const trials = new DrizzleTrials(db)
    expect(await trials.claim("42", "u1", 1_000)).toEqual({ userId: "u1", startedAt: 1_000 })
    expect(await trials.claim("42", "u2", 2_000)).toEqual({ userId: "u1", startedAt: 1_000 })
  })
})

describe("DrizzleUsage", () => {
  it("reserves atomically up to the cap and releases", async () => {
    const usage = new DrizzleUsage(db)
    expect(await usage.reserve("u1", "2026-10-11", 6, 10)).toBe(6)
    expect(await usage.reserve("u1", "2026-10-11", 5, 10)).toBeNull()
    expect(await usage.reserve("u1", "2026-10-11", 4, 10)).toBe(10)
    await usage.release("u1", "2026-10-11", 3)
    expect(await usage.reserve("u1", "2026-10-11", 3, 10)).toBe(10)
    expect(await usage.reserve("u1", "2026-10-12", 1, 10)).toBe(1)
    expect(await usage.reserve("u2", "2026-10-11", 11, 10)).toBeNull()
  })
})

describe("DrizzleConfigs", () => {
  it("versions configs with a serial", async () => {
    const configs = new DrizzleConfigs(db)
    expect(await configs.latest()).toBeNull()
    const { version: _, ...editable } = DEFAULT_REMOTE_CONFIG
    const first = await configs.save(editable, "admin@x.fr")
    const second = await configs.save({ ...editable, killSwitch: true }, "admin@x.fr")
    expect(second.version).toBe(first.version + 1)
    expect(await configs.latest()).toEqual({ ...DEFAULT_REMOTE_CONFIG, killSwitch: true, version: second.version })
    expect((await configs.history(5)).map((v) => [v.version, v.createdBy])).toEqual([
      [second.version, "admin@x.fr"],
      [first.version, "admin@x.fr"],
    ])
  })
})

describe("DrizzleErrorCounts", () => {
  it("increments counts", async () => {
    const counts = new DrizzleErrorCounts(db)
    await counts.add(1, "0.1.0", [{ code: "88", count: 2 }, { code: "226", count: 1 }])
    await counts.add(1, "0.1.0", [{ code: "88", count: 3 }])
    expect(await counts.list()).toEqual([
      { configVersion: 1, extensionVersion: "0.1.0", code: "88", count: 5 },
      { configVersion: 1, extensionVersion: "0.1.0", code: "226", count: 1 },
    ])
  })
})
