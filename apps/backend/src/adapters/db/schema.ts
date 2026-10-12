import { relations } from "drizzle-orm"
import { boolean, index, integer, jsonb, pgTable, primaryKey, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"

// Better Auth core tables: exact `npx auth generate` output for 1.7.7 (docs/research/backend-auth-stripe.md §1).

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  role: text("role").default("user"),
})

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_userId_idx").on(t.userId)]
)

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("account_userId_idx").on(t.userId)]
)

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)]
)

export const userRelations = relations(user, ({ many }) => ({ sessions: many(session), accounts: many(account) }))
export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}))
export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}))

// Cash Boost tables.

/** Entitlement inputs and the ActiveBrowser of an Account (one row per user, created lazily). */
export const access = pgTable(
  "access",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    trialStartedAt: timestamp("trial_started_at", { withTimezone: true }),
    trialXUserId: text("trial_x_user_id"),
    accessOverride: text("access_override", { enum: ["grant", "revoke"] }),
    /** Normalized Growth Boost purchase email: unique, one Account per purchase. */
    studentEmail: text("student_email"),
    studentMember: boolean("student_member").default(false).notNull(),
    studentCheckedAt: timestamp("student_checked_at", { withTimezone: true }),
    /** Epoch ms of recent link attempts. */
    studentLinkAttempts: jsonb("student_link_attempts").$type<number[]>().default([]).notNull(),
    activeBrowserId: text("active_browser_id"),
    /** Epoch ms of recent ActiveBrowser changes. */
    browserChanges: jsonb("browser_changes").$type<number[]>().default([]).notNull(),
  },
  (table) => [uniqueIndex("access_student_email_unique").on(table.studentEmail)]
)

/** Link code emailed to a purchase email (one pending per Account); only the code's hash is stored. */
export const studentLinkCodes = pgTable("student_link_codes", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  codeHash: text("code_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  failures: integer("failures").default(0).notNull(),
})

/** One Trial per X account, across all Google accounts. No FK: kept when the user is deleted. */
export const trials = pgTable("trials", {
  xUserId: text("x_user_id").primaryKey(),
  userId: text("user_id").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
})

export const purchases = pgTable(
  "purchases",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    checkoutSessionId: text("checkout_session_id").notNull().unique(),
    paymentIntentId: text("payment_intent_id"),
    /** Minor units (cents), tax included. */
    amount: integer("amount").notNull(),
    currency: text("currency").notNull(),
    status: text("status", { enum: ["paid", "refunded"] }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("purchases_user_id_idx").on(t.userId), index("purchases_payment_intent_id_idx").on(t.paymentIntentId)]
)

export const classificationUsage = pgTable(
  "classification_usage",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** UTC day, `YYYY-MM-DD`. */
    day: text("day").notNull(),
    count: integer("count").default(0).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })]
)

export const remoteConfig = pgTable("remote_config", {
  version: serial("version").primaryKey(),
  /** RemoteConfig without its `version`. */
  config: jsonb("config").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: text("created_by").notNull(),
})

export const errorCounts = pgTable(
  "error_counts",
  {
    configVersion: integer("config_version").notNull(),
    extensionVersion: text("extension_version").notNull(),
    code: text("code").notNull(),
    count: integer("count").default(0).notNull(),
  },
  (t) => [primaryKey({ columns: [t.configVersion, t.extensionVersion, t.code] })]
)

/** The tables Better Auth's drizzle adapter needs. */
export const authSchema = { user, session, account, verification }
