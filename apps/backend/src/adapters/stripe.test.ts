import Stripe from "stripe"
import { describe, expect, it } from "vitest"

import { InvalidWebhook } from "../application"
import { StripePayments } from "./stripe"

const SECRET = "whsec_test"

function setup(respond: (body: string) => Response = () => new Response("{}")) {
  const bodies: string[] = []
  const stripe = new Stripe("sk_test_123", {
    httpClient: Stripe.createFetchHttpClient(async (_input, init) => {
      bodies.push(String(init?.body ?? ""))
      return respond(String(init?.body ?? ""))
    }),
    maxNetworkRetries: 0,
  })
  const payments = new StripePayments(stripe, { priceId: "price_1", webhookSecret: SECRET, publicUrl: "https://api.test/" })
  return { stripe, payments, bodies }
}

async function signed(stripe: Stripe, type: string, object: Record<string, unknown>) {
  const payload = JSON.stringify({ id: "evt_1", object: "event", type, data: { object } })
  return { payload, signature: await stripe.webhooks.generateTestHeaderStringAsync({ payload, secret: SECRET }) }
}

describe("StripePayments", () => {
  it("creates a payment Checkout with Stripe Tax and the user as client_reference_id", async () => {
    const { payments, bodies } = setup(() =>
      new Response(JSON.stringify({ id: "cs_1", object: "checkout.session", url: "https://checkout.stripe.com/c/cs_1" }))
    )
    expect(await payments.createCheckout({ userId: "u1", email: "a@b.c" })).toBe("https://checkout.stripe.com/c/cs_1")
    const params = new URLSearchParams(bodies[0])
    expect(params.get("mode")).toBe("payment")
    expect(params.get("line_items[0][price]")).toBe("price_1")
    expect(params.get("client_reference_id")).toBe("u1")
    expect(params.get("customer_email")).toBe("a@b.c")
    expect(params.get("automatic_tax[enabled]")).toBe("true")
    expect(params.get("success_url")).toBe("https://api.test/checkout/success?session_id={CHECKOUT_SESSION_ID}")
    expect(params.get("cancel_url")).toBe("https://api.test/checkout/cancel")
  })

  it("maps a paid Checkout Session", async () => {
    const { stripe, payments } = setup()
    const { payload, signature } = await signed(stripe, "checkout.session.completed", {
      id: "cs_1",
      object: "checkout.session",
      payment_status: "paid",
      client_reference_id: "u1",
      payment_intent: "pi_1",
      amount_total: 9900,
      currency: "eur",
    })
    expect(await payments.parseWebhook(payload, signature)).toEqual({
      type: "paid",
      userId: "u1",
      checkoutSessionId: "cs_1",
      paymentIntentId: "pi_1",
      amount: 9900,
      currency: "eur",
    })
  })

  it("ignores an unpaid session and a partial refund; maps a full refund", async () => {
    const { stripe, payments } = setup()
    const unpaid = await signed(stripe, "checkout.session.completed", { id: "cs_1", payment_status: "unpaid", client_reference_id: "u1" })
    expect(await payments.parseWebhook(unpaid.payload, unpaid.signature)).toEqual({ type: "ignored" })
    const partial = await signed(stripe, "charge.refunded", { id: "ch_1", refunded: false, payment_intent: "pi_1" })
    expect(await payments.parseWebhook(partial.payload, partial.signature)).toEqual({ type: "ignored" })
    const full = await signed(stripe, "charge.refunded", { id: "ch_1", refunded: true, payment_intent: "pi_1" })
    expect(await payments.parseWebhook(full.payload, full.signature)).toEqual({ type: "refunded", paymentIntentId: "pi_1" })
  })

  it("rejects a bad signature", async () => {
    const { stripe, payments } = setup()
    const { payload } = await signed(stripe, "checkout.session.completed", {})
    await expect(payments.parseWebhook(payload, "t=1,v1=forged")).rejects.toBeInstanceOf(InvalidWebhook)
  })
})
