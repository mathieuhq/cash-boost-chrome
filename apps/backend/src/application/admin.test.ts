import { describe, expect, it } from "vitest"

import { AdminService } from "./admin"
import { FakeClock, InMemoryAccounts, InMemoryPurchases } from "./testing/fakes"

describe("AdminService", () => {
  it("lists users with their status and applies overrides", async () => {
    const accounts = new InMemoryAccounts()
    const purchases = new InMemoryPurchases()
    const admin = new AdminService(accounts, purchases, new FakeClock())
    accounts.add({ id: "a", access: { activeBrowserId: "b1" } })
    accounts.add({ id: "b" })
    await purchases.recordPaid({ userId: "b", checkoutSessionId: "cs", paymentIntentId: null, amount: 1, currency: "eur" })

    expect((await admin.users()).map((u) => [u.id, u.status, u.activeBrowserId])).toEqual([
      ["b", "paid", null],
      ["a", "none", "b1"],
    ])
    await admin.setOverride("a", "grant")
    expect((await admin.users("a@"))[0]).toMatchObject({ id: "a", status: "student", override: "grant" })
    await admin.setOverride("a", null)
    expect((await admin.users("a@"))[0]!.status).toBe("none")
    await expect(admin.setOverride("ghost", "grant")).rejects.toMatchObject({ status: 404 })
  })

  it("unlinks a student email so another account can link it", async () => {
    const accounts = new InMemoryAccounts()
    const admin = new AdminService(accounts, new InMemoryPurchases(), new FakeClock())
    accounts.add({ id: "a", access: { studentEmail: "eleve@ecole.fr", studentMember: true, studentCheckedAt: 1 } })
    accounts.add({ id: "b" })
    await admin.unlinkStudent("a")
    expect((await accounts.find("a"))!.access).toMatchObject({ studentEmail: null, studentMember: false, studentCheckedAt: null })
    expect(await accounts.linkStudent("b", "eleve@ecole.fr", 2)).toBe(true)
    await expect(admin.unlinkStudent("ghost")).rejects.toMatchObject({ status: 404 })
  })
})
