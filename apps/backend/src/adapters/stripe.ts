import type Stripe from "stripe"

import { InvalidWebhook, UpstreamUnavailable, type PaymentEvent, type PaymentGateway } from "../application"

export interface StripePaymentsOptions {
  priceId: string
  webhookSecret: string
  /** Backend base URL, for the success/cancel pages. */
  publicUrl: string
}

const idOf = (value: string | { id: string } | null): string | null => (typeof value === "string" ? value : (value?.id ?? null))

/** Stripe Checkout (one-time payment, Stripe Tax) and its webhooks (docs/research/backend-auth-stripe.md §6). */
export class StripePayments implements PaymentGateway {
  constructor(
    private readonly stripe: Stripe,
    private readonly options: StripePaymentsOptions
  ) {}

  async createCheckout({ userId, email }: { userId: string; email: string }): Promise<string> {
    const base = this.options.publicUrl.replace(/\/$/, "")
    let session: Stripe.Checkout.Session
    try {
      session = await this.stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [{ price: this.options.priceId, quantity: 1 }],
        client_reference_id: userId,
        customer_email: email,
        customer_creation: "always",
        automatic_tax: { enabled: true },
        billing_address_collection: "required",
        metadata: { userId },
        payment_intent_data: { metadata: { userId } },
        success_url: `${base}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${base}/checkout/cancel`,
      })
    } catch {
      throw new UpstreamUnavailable("stripe")
    }
    if (!session.url) throw new UpstreamUnavailable("stripe")
    return session.url
  }

  async parseWebhook(payload: string, signature: string): Promise<PaymentEvent> {
    let event: Stripe.Event
    try {
      event = await this.stripe.webhooks.constructEventAsync(payload, signature, this.options.webhookSecret)
    } catch {
      throw new InvalidWebhook()
    }
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object
        // Async payment methods complete as "unpaid" first, then send async_payment_succeeded.
        if (session.payment_status !== "paid" || !session.client_reference_id) return { type: "ignored" }
        return {
          type: "paid",
          userId: session.client_reference_id,
          checkoutSessionId: session.id,
          paymentIntentId: idOf(session.payment_intent),
          amount: session.amount_total ?? 0,
          currency: session.currency ?? "",
        }
      }
      case "charge.refunded": {
        const charge = event.data.object
        const paymentIntentId = idOf(charge.payment_intent)
        // Partial refunds keep the licence.
        if (!charge.refunded || !paymentIntentId) return { type: "ignored" }
        return { type: "refunded", paymentIntentId }
      }
      default:
        return { type: "ignored" }
    }
  }
}
