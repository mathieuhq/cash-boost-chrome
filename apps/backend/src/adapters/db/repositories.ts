import type { RemoteConfig } from "@super-x/contracts"
import { and, desc, eq, ilike, inArray, isNull, sql } from "drizzle-orm"

import {
  EMPTY_ACCESS,
  type AccessRecord,
  type AccountRecord,
  type AccountRepository,
  type ClassificationUsage,
  type ConfigRepository,
  type ConfigVersion,
  type ErrorCountRow,
  type ErrorCounts,
  type PaidPurchase,
  type PendingStudentLink,
  type PurchaseRepository,
  type StudentLinkCodes,
  type Role,
  type TrialRegistry,
} from "../../application"
import type { Database } from "./database"
import { access, classificationUsage, errorCounts, purchases, remoteConfig, studentLinkCodes, trials, user } from "./schema"

const ms = (date: Date | null) => (date === null ? null : date.getTime())
const date = (value: number | null) => (value === null ? null : new Date(value))

type AccessRow = typeof access.$inferSelect

function toAccess(row: AccessRow | null): AccessRecord {
  if (!row) return { ...EMPTY_ACCESS }
  return {
    trialStartedAt: ms(row.trialStartedAt),
    trialXUserId: row.trialXUserId,
    override: row.accessOverride,
    studentEmail: row.studentEmail,
    studentMember: row.studentMember,
    studentCheckedAt: ms(row.studentCheckedAt),
    studentLinkAttempts: row.studentLinkAttempts,
    activeBrowserId: row.activeBrowserId,
    browserChanges: row.browserChanges,
  }
}

function toAccessRow(patch: Partial<AccessRecord>): Partial<Omit<AccessRow, "userId">> {
  const row: Partial<Omit<AccessRow, "userId">> = {}
  if (patch.trialStartedAt !== undefined) row.trialStartedAt = date(patch.trialStartedAt)
  if (patch.trialXUserId !== undefined) row.trialXUserId = patch.trialXUserId
  if (patch.override !== undefined) row.accessOverride = patch.override
  if (patch.studentEmail !== undefined) row.studentEmail = patch.studentEmail
  if (patch.studentMember !== undefined) row.studentMember = patch.studentMember
  if (patch.studentCheckedAt !== undefined) row.studentCheckedAt = date(patch.studentCheckedAt)
  if (patch.studentLinkAttempts !== undefined) row.studentLinkAttempts = patch.studentLinkAttempts
  if (patch.activeBrowserId !== undefined) row.activeBrowserId = patch.activeBrowserId
  if (patch.browserChanges !== undefined) row.browserChanges = patch.browserChanges
  return row
}

export class DrizzleAccounts implements AccountRepository {
  constructor(private readonly db: Database) {}

  private select() {
    return this.db.select({ user, access }).from(user).leftJoin(access, eq(access.userId, user.id))
  }

  private static toRecord({ user: u, access: a }: { user: typeof user.$inferSelect; access: AccessRow | null }): AccountRecord {
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      image: u.image,
      role: (u.role === "admin" ? "admin" : "user") satisfies Role,
      createdAt: u.createdAt.getTime(),
      access: toAccess(a),
    }
  }

  async find(userId: string) {
    const [row] = await this.select().where(eq(user.id, userId)).limit(1)
    return row ? DrizzleAccounts.toRecord(row) : null
  }

  async list({ search, limit }: { search?: string; limit: number }) {
    const query = this.select()
    const filtered = search ? query.where(ilike(user.email, `%${search.replace(/[\\%_]/g, "\\$&")}%`)) : query
    const rows = await filtered.orderBy(desc(user.createdAt)).limit(limit)
    return rows.map(DrizzleAccounts.toRecord)
  }

  async updateAccess(userId: string, patch: Partial<AccessRecord>) {
    const values = toAccessRow(patch)
    if (Object.keys(values).length === 0) return
    await this.db
      .insert(access)
      .values({ userId, ...values })
      .onConflictDoUpdate({ target: access.userId, set: values })
  }

  async startTrial(userId: string, xUserId: string, at: number) {
    const values = { trialStartedAt: new Date(at), trialXUserId: xUserId }
    const rows = await this.db
      .insert(access)
      .values({ userId, ...values })
      .onConflictDoUpdate({ target: access.userId, set: values, setWhere: isNull(access.trialStartedAt) })
      .returning({ userId: access.userId })
    return rows.length > 0
  }

  async linkStudent(userId: string, email: string, checkedAt: number) {
    const values = { studentEmail: email, studentMember: true, studentCheckedAt: new Date(checkedAt) }
    try {
      await this.db.insert(access).values({ userId, ...values }).onConflictDoUpdate({ target: access.userId, set: values })
      return true
    } catch (error) {
      // access_student_email_unique: another Account holds this email (also settles concurrent claims).
      if (isUniqueViolation(error)) return false
      throw error
    }
  }

  async studentEmailOwner(email: string) {
    const [row] = await this.db.select({ userId: access.userId }).from(access).where(eq(access.studentEmail, email)).limit(1)
    return row?.userId ?? null
  }
}

export class DrizzleStudentCodes implements StudentLinkCodes {
  constructor(private readonly db: Database) {}

  async save(userId: string, pending: PendingStudentLink) {
    const values = { email: pending.email, codeHash: pending.codeHash, expiresAt: new Date(pending.expiresAt), failures: pending.failures }
    await this.db
      .insert(studentLinkCodes)
      .values({ userId, ...values })
      .onConflictDoUpdate({ target: studentLinkCodes.userId, set: values })
  }

  async find(userId: string) {
    const [row] = await this.db.select().from(studentLinkCodes).where(eq(studentLinkCodes.userId, userId)).limit(1)
    return row ? { email: row.email, codeHash: row.codeHash, expiresAt: row.expiresAt.getTime(), failures: row.failures } : null
  }

  async fail(userId: string) {
    const [row] = await this.db
      .update(studentLinkCodes)
      .set({ failures: sql`${studentLinkCodes.failures} + 1` })
      .where(eq(studentLinkCodes.userId, userId))
      .returning({ failures: studentLinkCodes.failures })
    return row?.failures ?? 0
  }

  async delete(userId: string) {
    await this.db.delete(studentLinkCodes).where(eq(studentLinkCodes.userId, userId))
  }
}

/** Postgres 23505, raised directly (PGlite) or wrapped by Drizzle (`cause`). */
function isUniqueViolation(error: unknown): boolean {
  for (let current = error; current instanceof Error; current = current.cause) {
    if ((current as { code?: unknown }).code === "23505") return true
  }
  return false
}

export class DrizzlePurchases implements PurchaseRepository {
  constructor(private readonly db: Database) {}

  async hasPaid(userId: string) {
    const rows = await this.db
      .select({ id: purchases.id })
      .from(purchases)
      .where(and(eq(purchases.userId, userId), eq(purchases.status, "paid")))
      .limit(1)
    return rows.length > 0
  }

  async paidUserIds(userIds: string[]) {
    if (userIds.length === 0) return new Set<string>()
    const rows = await this.db
      .selectDistinct({ userId: purchases.userId })
      .from(purchases)
      .where(and(inArray(purchases.userId, userIds), eq(purchases.status, "paid")))
    return new Set(rows.map((row) => row.userId))
  }

  async recordPaid(purchase: PaidPurchase) {
    await this.db
      .insert(purchases)
      .values({ ...purchase, status: "paid" })
      .onConflictDoNothing({ target: purchases.checkoutSessionId })
  }

  async markRefunded(paymentIntentId: string) {
    const rows = await this.db
      .update(purchases)
      .set({ status: "refunded" })
      .where(eq(purchases.paymentIntentId, paymentIntentId))
      .returning({ id: purchases.id })
    return rows.length > 0
  }
}

export class DrizzleTrials implements TrialRegistry {
  constructor(private readonly db: Database) {}

  async claim(xUserId: string, userId: string, at: number) {
    await this.db.insert(trials).values({ xUserId, userId, startedAt: new Date(at) }).onConflictDoNothing()
    const [row] = await this.db.select().from(trials).where(eq(trials.xUserId, xUserId)).limit(1)
    if (!row) throw new Error("trial claim lost")
    return { userId: row.userId, startedAt: row.startedAt.getTime() }
  }
}

export class DrizzleUsage implements ClassificationUsage {
  constructor(private readonly db: Database) {}

  async reserve(userId: string, day: string, count: number, cap: number) {
    if (count > cap) return null
    const rows = await this.db
      .insert(classificationUsage)
      .values({ userId, day, count })
      .onConflictDoUpdate({
        target: [classificationUsage.userId, classificationUsage.day],
        set: { count: sql`${classificationUsage.count} + excluded.count` },
        setWhere: sql`${classificationUsage.count} + excluded.count <= ${cap}`,
      })
      .returning({ count: classificationUsage.count })
    return rows[0]?.count ?? null
  }

  async release(userId: string, day: string, count: number) {
    await this.db
      .update(classificationUsage)
      .set({ count: sql`greatest(${classificationUsage.count} - ${count}, 0)` })
      .where(and(eq(classificationUsage.userId, userId), eq(classificationUsage.day, day)))
  }
}

export class DrizzleConfigs implements ConfigRepository {
  constructor(private readonly db: Database) {}

  async latest() {
    const [row] = await this.db.select().from(remoteConfig).orderBy(desc(remoteConfig.version)).limit(1)
    return row ? ({ ...(row.config as Omit<RemoteConfig, "version">), version: row.version } satisfies RemoteConfig) : null
  }

  async save(config: Omit<RemoteConfig, "version">, createdBy: string) {
    const [row] = await this.db.insert(remoteConfig).values({ config, createdBy }).returning({ version: remoteConfig.version })
    if (!row) throw new Error("config not saved")
    return { ...config, version: row.version }
  }

  async history(limit: number): Promise<ConfigVersion[]> {
    const rows = await this.db
      .select({ version: remoteConfig.version, createdAt: remoteConfig.createdAt, createdBy: remoteConfig.createdBy })
      .from(remoteConfig)
      .orderBy(desc(remoteConfig.version))
      .limit(limit)
    return rows.map((row) => ({ ...row, createdAt: row.createdAt.getTime() }))
  }
}

export class DrizzleErrorCounts implements ErrorCounts {
  constructor(private readonly db: Database) {}

  /** `codes` must be unique (Postgres can't update the same row twice in one statement). */
  async add(configVersion: number, extensionVersion: string, codes: { code: string; count: number }[]) {
    if (codes.length === 0) return
    await this.db
      .insert(errorCounts)
      .values(codes.map(({ code, count }) => ({ configVersion, extensionVersion, code, count })))
      .onConflictDoUpdate({
        target: [errorCounts.configVersion, errorCounts.extensionVersion, errorCounts.code],
        set: { count: sql`${errorCounts.count} + excluded.count` },
      })
  }

  async list(): Promise<ErrorCountRow[]> {
    return this.db
      .select()
      .from(errorCounts)
      .orderBy(desc(errorCounts.configVersion), desc(errorCounts.count), errorCounts.code)
  }
}
