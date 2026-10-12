import type { CheckoutResponse } from "@super-x/contracts"

import type { AccessService } from "./access"
import { AppError } from "./errors"
import {
  InvalidWebhook,
  UpstreamUnavailable,
  type AccountRepository,
  type PaymentGateway,
  type PurchaseRepository,
} from "./ports"

export interface BillingDeps {
  access: AccessService
  accounts: AccountRepository
  purchases: PurchaseRepository
  payments: PaymentGateway
}

/** One-time purchase through Stripe Checkout; the webhook grants and revokes the licence. */
export class BillingService {
  constructor(private readonly deps: BillingDeps) {}

  async checkout(userId: string): Promise<CheckoutResponse> {
    const account = await this.deps.access.account(userId)
    if (await this.deps.purchases.hasPaid(userId)) throw new AppError("invalid_request", 409, "already_paid")
    try {
      return { url: await this.deps.payments.createCheckout({ userId, email: account.email }) }
    } catch (error) {
      if (error instanceof UpstreamUnavailable) throw new AppError("upstream_unavailable", 502)
      throw error
    }
  }

  /** Idempotent: Stripe retries and may deliver an event more than once. */
  async handleWebhook(payload: string, signature: string): Promise<void> {
    let event
    try {
      event = await this.deps.payments.parseWebhook(payload, signature)
    } catch (error) {
      if (error instanceof InvalidWebhook) throw new AppError("invalid_request", 400, "invalid_signature")
      throw error
    }
    if (event.type === "paid") {
      // A session without a known account can't be fulfilled; acknowledge it so Stripe stops retrying.
      if (!(await this.deps.accounts.find(event.userId))) return
      const { type: _, ...purchase } = event
      await this.deps.purchases.recordPaid(purchase)
    } else if (event.type === "refunded") {
      await this.deps.purchases.markRefunded(event.paymentIntentId)
    }
  }
}
