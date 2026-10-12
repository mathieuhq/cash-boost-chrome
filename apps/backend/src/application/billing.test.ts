import { beforeEach, describe, expect, it } from "vitest"

import { AccessService } from "./access"
import { BillingService } from "./billing"
import { AppError } from "./errors"
import type { PaymentEvent } from "./ports"
import {
  FakeClock,
  FakeLearnHouse,
  FakeMailer,
  FakePayments,
  InMemoryAccounts,
  InMemoryPurchases,
  InMemoryStudentCodes,
  InMemoryTrials,
} from "./testing/fakes"

let accounts: InMemoryAccounts
let purchases: InMemoryPurchases
let payments: FakePayments
let billing: BillingService

const paid: PaymentEvent = {
  type: "paid",
  userId: "u1",
  checkoutSessionId: "cs_1",
  paymentIntentId: "pi_1",
  amount: 9900,
  currency: "eur",
}

beforeEach(() => {
  accounts = new InMemoryAccounts()
  purchases = new InMemoryPurchases()
  payments = new FakePayments()
  const clock = new FakeClock()
  const access = new AccessService({
    accounts,
    purchases,
    trials: new InMemoryTrials(),
    learnhouse: new FakeLearnHouse(),
    codes: new InMemoryStudentCodes(),
    mailer: new FakeMailer(),
    clock,
  })
  billing = new BillingService({ access, accounts, purchases, payments })
  accounts.add({ id: "u1", email: "a@b.c" })
})

describe("BillingService", () => {
  it("creates a Checkout for the account", async () => {
    expect(await billing.checkout("u1")).toEqual({ url: "https://checkout.stripe.test/u1" })
    expect(payments.checkouts).toEqual([{ userId: "u1", email: "a@b.c" }])
  })

  it("409 when already paid", async () => {
    await billing.handleWebhook(JSON.stringify(paid), "valid")
    const error = await billing.checkout("u1").catch((e: AppError) => e)
    expect(error).toMatchObject({ code: "invalid_request", status: 409, message: "already_paid" })
  })

  it("records a payment once, then revokes it on refund", async () => {
    await billing.handleWebhook(JSON.stringify(paid), "valid")
    await billing.handleWebhook(JSON.stringify(paid), "valid")
    expect(purchases.rows).toHaveLength(1)
    expect(await purchases.hasPaid("u1")).toBe(true)
    await billing.handleWebhook(JSON.stringify({ type: "refunded", paymentIntentId: "pi_1" }), "valid")
    await billing.handleWebhook(JSON.stringify(paid), "valid")
    expect(await purchases.hasPaid("u1")).toBe(false)
  })

  it("ignores a payment for an unknown account", async () => {
    await billing.handleWebhook(JSON.stringify({ ...paid, userId: "ghost" }), "valid")
    expect(purchases.rows).toHaveLength(0)
  })

  it("400 on a bad signature", async () => {
    const error = await billing.handleWebhook("{}", "forged").catch((e: AppError) => e)
    expect(error).toMatchObject({ code: "invalid_request", status: 400 })
  })
})
