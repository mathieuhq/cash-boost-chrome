import type { RemoteConfig } from "@super-x/contracts"

import type { AccessOverride } from "../domain"

export interface Clock {
  now(): number
}

/** Cash Boost state of an Account, next to its Better Auth user row. */
export interface AccessRecord {
  trialStartedAt: number | null
  trialXUserId: string | null
  override: AccessOverride | null
  /** Growth Boost purchase email, locked to this Account: no other Account can link it. */
  studentEmail: string | null
  studentMember: boolean
  studentCheckedAt: number | null
  /** Epoch ms of recent "link my purchase" attempts. */
  studentLinkAttempts: number[]
  activeBrowserId: string | null
  browserChanges: number[]
}

export const EMPTY_ACCESS: AccessRecord = {
  trialStartedAt: null,
  trialXUserId: null,
  override: null,
  studentEmail: null,
  studentMember: false,
  studentCheckedAt: null,
  studentLinkAttempts: [],
  activeBrowserId: null,
  browserChanges: [],
}

export type Role = "user" | "admin"

export interface AccountRecord {
  id: string
  email: string
  name: string
  image: string | null
  role: Role
  createdAt: number
  access: AccessRecord
}

export interface AccountRepository {
  find(userId: string): Promise<AccountRecord | null>
  /** Newest first; `search` matches the email. */
  list(options: { search?: string; limit: number }): Promise<AccountRecord[]>
  updateAccess(userId: string, patch: Partial<AccessRecord>): Promise<void>
  /** Records the Trial only if the account has none yet; false when another request won the race. */
  startTrial(userId: string, xUserId: string, at: number): Promise<boolean>
  /** Locks a member's email to this Account; false when another Account already holds it. */
  linkStudent(userId: string, email: string, checkedAt: number): Promise<boolean>
  /** The Account holding this student email, if any. */
  studentEmailOwner(email: string): Promise<string | null>
}

/** A link code emailed to a purchase email, waiting to be entered. Only its hash is stored. */
export interface PendingStudentLink {
  email: string
  codeHash: string
  expiresAt: number
  failures: number
}

export interface StudentLinkCodes {
  /** Replaces the Account's pending code. */
  save(userId: string, pending: PendingStudentLink): Promise<void>
  find(userId: string): Promise<PendingStudentLink | null>
  /** Counts a wrong code and returns the new count. */
  fail(userId: string): Promise<number>
  delete(userId: string): Promise<void>
}

export interface Mailer {
  /** Emails the 6-digit link code to a purchase email. Throws UpstreamUnavailable. */
  sendStudentCode(to: string, code: string): Promise<void>
}

export interface PaidPurchase {
  userId: string
  checkoutSessionId: string
  paymentIntentId: string | null
  amount: number
  currency: string
}

export interface PurchaseRepository {
  hasPaid(userId: string): Promise<boolean>
  paidUserIds(userIds: string[]): Promise<Set<string>>
  /** Idempotent on the Checkout Session id; never turns a refunded purchase back to paid. */
  recordPaid(purchase: PaidPurchase): Promise<void>
  markRefunded(paymentIntentId: string): Promise<boolean>
}

export interface TrialRegistry {
  /** Claims the X account for this user unless another account already did; returns the owner. */
  claim(xUserId: string, userId: string, at: number): Promise<{ userId: string; startedAt: number }>
}

export interface ClassificationUsage {
  /** Atomically adds `count` unless the day's total would exceed `cap`. Returns the new total, or null. */
  reserve(userId: string, day: string, count: number, cap: number): Promise<number | null>
  release(userId: string, day: string, count: number): Promise<void>
}

export interface ConfigVersion {
  version: number
  createdAt: number
  createdBy: string
}

export interface ConfigRepository {
  latest(): Promise<RemoteConfig | null>
  /** Stores a new version; the version number is assigned here. */
  save(config: Omit<RemoteConfig, "version">, createdBy: string): Promise<RemoteConfig>
  history(limit: number): Promise<ConfigVersion[]>
}

export interface ErrorCountRow {
  configVersion: number
  extensionVersion: string
  code: string
  count: number
}

export interface ErrorCounts {
  add(configVersion: number, extensionVersion: string, codes: { code: string; count: number }[]): Promise<void>
  list(): Promise<ErrorCountRow[]>
}

/** An external service (LearnHouse, OpenRouter, Stripe, Resend) failed or timed out. */
export class UpstreamUnavailable extends Error {
  constructor(readonly service: string) {
    super(`${service} unavailable`)
    this.name = "UpstreamUnavailable"
  }
}

export interface LearnHouseGateway {
  /** Whether this LearnHouse email belongs to one of the Growth Boost groups. Throws UpstreamUnavailable. */
  isMember(email: string): Promise<boolean>
}

export interface JevGateway {
  /** P(the comment asks for the lead magnet). Throws UpstreamUnavailable. */
  probability(keyword: string, comment: string): Promise<number>
}

export type PaymentEvent =
  | ({ type: "paid" } & PaidPurchase)
  | { type: "refunded"; paymentIntentId: string }
  | { type: "ignored" }

export class InvalidWebhook extends Error {
  constructor() {
    super("invalid webhook signature")
    this.name = "InvalidWebhook"
  }
}

export interface PaymentGateway {
  /** Returns the hosted Checkout URL. Throws UpstreamUnavailable. */
  createCheckout(input: { userId: string; email: string }): Promise<string>
  /** Verifies the signature (InvalidWebhook) and maps the event. */
  parseWebhook(payload: string, signature: string): Promise<PaymentEvent>
}
