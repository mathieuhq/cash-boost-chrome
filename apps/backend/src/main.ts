import Stripe from "stripe"

import { createAuth } from "./adapters/auth"
import type { Database } from "./adapters/db/database"
import {
  DrizzleAccounts,
  DrizzleConfigs,
  DrizzleErrorCounts,
  DrizzlePurchases,
  DrizzleStudentCodes,
  DrizzleTrials,
  DrizzleUsage,
} from "./adapters/db/repositories"
import { HttpLearnHouse } from "./adapters/learnhouse"
import { OpenRouterJev } from "./adapters/openrouter"
import { ConsoleMailer, ResendMailer } from "./adapters/resend"
import { StripePayments } from "./adapters/stripe"
import {
  AccessService,
  AdminService,
  BillingService,
  ClassifyService,
  ConfigService,
  type Clock,
  type JevGateway,
  type LearnHouseGateway,
  type Mailer,
  type PaymentGateway,
} from "./application"
import type { Env } from "./env"
import { createApp } from "./http/app"

/** Test seams: external services and time. */
export interface BackendOverrides {
  clock?: Clock
  learnhouse?: LearnHouseGateway
  jev?: JevGateway
  payments?: PaymentGateway
  mailer?: Mailer
}

/** Composition root (ADR 0002): wires adapters into use cases into the Hono app. */
export function createBackend(env: Env, db: Database, overrides: BackendOverrides = {}) {
  const baseUrl = env.BETTER_AUTH_URL.replace(/\/$/, "")
  const clock = overrides.clock ?? { now: () => Date.now() }

  const accounts = new DrizzleAccounts(db)
  const purchases = new DrizzlePurchases(db)

  const learnhouse =
    overrides.learnhouse ??
    new HttpLearnHouse({
      baseUrl: env.LEARNHOUSE_URL,
      apiToken: env.LEARNHOUSE_API_TOKEN,
      orgSlug: env.LEARNHOUSE_ORG_SLUG,
      groupUuids: env.LEARNHOUSE_GROUP_UUIDS,
    })
  const jev = overrides.jev ?? new OpenRouterJev({ apiKey: env.OPENROUTER_API_KEY, model: env.JEV_MODEL })
  const payments =
    overrides.payments ??
    new StripePayments(new Stripe(env.STRIPE_SECRET_KEY || "sk_unset"), {
      priceId: env.STRIPE_PRICE_ID,
      webhookSecret: env.STRIPE_WEBHOOK_SECRET,
      publicUrl: baseUrl,
    })

  // RESEND_API_KEY is required in production (env.ts); local dev logs the codes instead.
  const mailer =
    overrides.mailer ??
    (env.RESEND_API_KEY ? new ResendMailer({ apiKey: env.RESEND_API_KEY, from: env.MAIL_FROM }) : new ConsoleMailer())

  const access = new AccessService({
    accounts,
    purchases,
    trials: new DrizzleTrials(db),
    learnhouse,
    codes: new DrizzleStudentCodes(db),
    mailer,
    clock,
  })
  const auth = createAuth({
    db,
    baseUrl,
    secret: env.BETTER_AUTH_SECRET,
    google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET },
    trustedOrigins: env.EXTENSION_IDS.map((id) => `chrome-extension://${id}`),
    adminEmails: env.ADMIN_EMAILS,
  })

  const app = createApp({
    auth,
    access,
    classify: new ClassifyService({ access, usage: new DrizzleUsage(db), jev, clock }),
    billing: new BillingService({ access, accounts, purchases, payments }),
    config: new ConfigService(new DrizzleConfigs(db), new DrizzleErrorCounts(db)),
    admin: new AdminService(accounts, purchases, clock),
    baseUrl,
    secret: env.BETTER_AUTH_SECRET,
    extensionIds: env.EXTENSION_IDS,
    testAuth: env.SUPERX_TEST_AUTH,
  })
  return { app, auth }
}
