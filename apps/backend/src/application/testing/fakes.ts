import type { RemoteConfig } from "@super-x/contracts"

import {
  EMPTY_ACCESS,
  InvalidWebhook,
  UpstreamUnavailable,
  type AccessRecord,
  type AccountRecord,
  type AccountRepository,
  type ClassificationUsage,
  type Clock,
  type ConfigRepository,
  type ConfigVersion,
  type ErrorCountRow,
  type ErrorCounts,
  type JevGateway,
  type LearnHouseGateway,
  type Mailer,
  type PendingStudentLink,
  type StudentLinkCodes,
  type PaidPurchase,
  type PaymentEvent,
  type PaymentGateway,
  type PurchaseRepository,
  type TrialRegistry,
} from "../ports"

export class FakeClock implements Clock {
  constructor(public time = Date.UTC(2026, 9, 11, 12)) {}
  now() {
    return this.time
  }
  advance(ms: number) {
    this.time += ms
  }
}

export class InMemoryAccounts implements AccountRepository {
  readonly rows = new Map<string, AccountRecord>()

  add(patch: Partial<Omit<AccountRecord, "access">> & { id: string; access?: Partial<AccessRecord> }): AccountRecord {
    const record: AccountRecord = {
      email: `${patch.id}@example.com`,
      name: patch.id,
      image: null,
      role: "user",
      createdAt: this.rows.size,
      ...patch,
      access: { ...EMPTY_ACCESS, ...patch.access },
    }
    this.rows.set(record.id, record)
    return record
  }

  async find(userId: string) {
    const row = this.rows.get(userId)
    return row ? structuredClone(row) : null
  }

  async list({ search, limit }: { search?: string; limit: number }) {
    return [...this.rows.values()]
      .filter((row) => !search || row.email.includes(search.toLowerCase()))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
      .map((row) => structuredClone(row))
  }

  async updateAccess(userId: string, patch: Partial<AccessRecord>) {
    const row = this.rows.get(userId)
    if (row) row.access = { ...row.access, ...patch }
  }

  async startTrial(userId: string, xUserId: string, at: number) {
    const row = this.rows.get(userId)
    if (!row || row.access.trialStartedAt !== null) return false
    row.access = { ...row.access, trialStartedAt: at, trialXUserId: xUserId }
    return true
  }

  async linkStudent(userId: string, email: string, checkedAt: number) {
    const taken = [...this.rows.values()].some((other) => other.id !== userId && other.access.studentEmail === email)
    const row = this.rows.get(userId)
    if (taken || !row) return false
    row.access = { ...row.access, studentEmail: email, studentMember: true, studentCheckedAt: checkedAt }
    return true
  }

  async studentEmailOwner(email: string) {
    return [...this.rows.values()].find((row) => row.access.studentEmail === email)?.id ?? null
  }
}

export class InMemoryStudentCodes implements StudentLinkCodes {
  readonly rows = new Map<string, PendingStudentLink>()
  async save(userId: string, pending: PendingStudentLink) {
    this.rows.set(userId, { ...pending })
  }
  async find(userId: string) {
    const row = this.rows.get(userId)
    return row ? { ...row } : null
  }
  async fail(userId: string) {
    const row = this.rows.get(userId)
    if (!row) return 0
    row.failures += 1
    return row.failures
  }
  async delete(userId: string) {
    this.rows.delete(userId)
  }
}

/** Keeps the sent codes; `down` simulates a Resend outage. */
export class FakeMailer implements Mailer {
  sent: { to: string; code: string }[] = []
  down = false
  async sendStudentCode(to: string, code: string) {
    if (this.down) throw new UpstreamUnavailable("resend")
    this.sent.push({ to, code })
  }
  lastCode() {
    return this.sent.at(-1)?.code
  }
}

interface PurchaseRow extends PaidPurchase {
  status: "paid" | "refunded"
}

export class InMemoryPurchases implements PurchaseRepository {
  readonly rows: PurchaseRow[] = []

  async hasPaid(userId: string) {
    return this.rows.some((row) => row.userId === userId && row.status === "paid")
  }
  async paidUserIds(userIds: string[]) {
    return new Set(userIds.filter((id) => this.rows.some((row) => row.userId === id && row.status === "paid")))
  }
  async recordPaid(purchase: PaidPurchase) {
    if (this.rows.some((row) => row.checkoutSessionId === purchase.checkoutSessionId)) return
    this.rows.push({ ...purchase, status: "paid" })
  }
  async markRefunded(paymentIntentId: string) {
    const rows = this.rows.filter((row) => row.paymentIntentId === paymentIntentId)
    for (const row of rows) row.status = "refunded"
    return rows.length > 0
  }
}

export class InMemoryTrials implements TrialRegistry {
  readonly rows = new Map<string, { userId: string; startedAt: number }>()
  async claim(xUserId: string, userId: string, at: number) {
    if (!this.rows.has(xUserId)) this.rows.set(xUserId, { userId, startedAt: at })
    return { ...this.rows.get(xUserId)! }
  }
}

export class InMemoryUsage implements ClassificationUsage {
  readonly counts = new Map<string, number>()
  async reserve(userId: string, day: string, count: number, cap: number) {
    const key = `${userId}/${day}`
    const total = (this.counts.get(key) ?? 0) + count
    if (total > cap) return null
    this.counts.set(key, total)
    return total
  }
  async release(userId: string, day: string, count: number) {
    const key = `${userId}/${day}`
    this.counts.set(key, Math.max(0, (this.counts.get(key) ?? 0) - count))
  }
}

export class InMemoryConfigs implements ConfigRepository {
  readonly versions: (RemoteConfig & { createdBy: string; createdAt: number })[] = []
  async latest() {
    const last = this.versions.at(-1)
    if (!last) return null
    const { createdBy: _, createdAt: __, ...config } = last
    return config
  }
  async save(config: Omit<RemoteConfig, "version">, createdBy: string) {
    const saved = { ...config, version: this.versions.length + 1 }
    this.versions.push({ ...saved, createdBy, createdAt: 0 })
    return saved
  }
  async history(limit: number): Promise<ConfigVersion[]> {
    return this.versions
      .map(({ version, createdAt, createdBy }) => ({ version, createdAt, createdBy }))
      .reverse()
      .slice(0, limit)
  }
}

export class InMemoryErrorCounts implements ErrorCounts {
  readonly rows: ErrorCountRow[] = []
  async add(configVersion: number, extensionVersion: string, codes: { code: string; count: number }[]) {
    for (const { code, count } of codes) {
      const row = this.rows.find(
        (r) => r.configVersion === configVersion && r.extensionVersion === extensionVersion && r.code === code
      )
      if (row) row.count += count
      else this.rows.push({ configVersion, extensionVersion, code, count })
    }
  }
  async list() {
    return [...this.rows]
  }
}

/** Members by email; `down` simulates an unreachable LearnHouse. */
export class FakeLearnHouse implements LearnHouseGateway {
  members = new Set<string>()
  down = false
  calls: string[] = []

  async isMember(email: string) {
    this.calls.push(email)
    if (this.down) throw new UpstreamUnavailable("learnhouse")
    return this.members.has(email)
  }
}

export class FakeJev implements JevGateway {
  down = false
  calls: { keyword: string; comment: string }[] = []
  constructor(public answer: (comment: string) => number = () => 0.5) {}
  async probability(keyword: string, comment: string) {
    this.calls.push({ keyword, comment })
    if (this.down) throw new UpstreamUnavailable("openrouter")
    return this.answer(comment)
  }
}

/** Webhook payloads are the PaymentEvent as JSON; the signature must be "valid". */
export class FakePayments implements PaymentGateway {
  checkouts: { userId: string; email: string }[] = []
  async createCheckout(input: { userId: string; email: string }) {
    this.checkouts.push(input)
    return `https://checkout.stripe.test/${input.userId}`
  }
  async parseWebhook(payload: string, signature: string): Promise<PaymentEvent> {
    if (signature !== "valid") throw new InvalidWebhook()
    return JSON.parse(payload) as PaymentEvent
  }
}
