import { z } from "zod"

const list = z
  .string()
  .default("")
  .transform((value) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  )

const optional = z.string().default("")

export const Env = z.object({
  BETTER_AUTH_URL: z.url().default("http://localhost:8787"),
  BETTER_AUTH_SECRET: z.string().min(32),
  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,
  EXTENSION_IDS: list.pipe(z.array(z.string().regex(/^[a-p]{32}$/, "Chrome extension ids are 32 letters a-p"))),
  ADMIN_EMAILS: list,
  DATABASE_URL: optional,
  PGLITE_DIR: z.string().default(".data/pglite"),
  OPENROUTER_API_KEY: optional,
  JEV_MODEL: z.string().default("typesafe/jev-1.13"),
  LEARNHOUSE_URL: z.url().default("https://learn.example.com"),
  LEARNHOUSE_API_TOKEN: optional,
  LEARNHOUSE_ORG_SLUG: z.string().default("my-school"),
  LEARNHOUSE_GROUP_UUIDS: list,
  RESEND_API_KEY: optional,
  /** Sender of the student link code, on a domain verified in Resend. */
  MAIL_FROM: z.string().default("Cash Boost <contact@mail.example.com>"),
  STRIPE_SECRET_KEY: optional,
  STRIPE_WEBHOOK_SECRET: optional,
  STRIPE_PRICE_ID: optional,
  PORT: z.coerce.number().int().default(8787),
  /** `pnpm dev --test`: sign-in without Google (test account). Refused in production. */
  SUPERX_TEST_AUTH: z
    .string()
    .default("")
    .transform((value) => value === "1" || value === "true"),
})
export type Env = z.infer<typeof Env>

/** Needed in production; local dev starts without them (the matching features fail at call time). */
const REQUIRED_IN_PRODUCTION = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "OPENROUTER_API_KEY",
  "LEARNHOUSE_API_TOKEN",
  "RESEND_API_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_ID",
] as const

export function parseEnv(source: Record<string, string | undefined>, production: boolean): Env {
  const parsed = Env.safeParse(source)
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`)
  }
  const env = parsed.data
  if (production && env.SUPERX_TEST_AUTH) throw new Error("SUPERX_TEST_AUTH is for local dev only")
  const missing: string[] = REQUIRED_IN_PRODUCTION.filter((key) => !env[key])
  // Local dev falls back to PGlite.
  if (production && !env.DATABASE_URL) missing.push("DATABASE_URL")
  if (env.EXTENSION_IDS.length === 0) missing.push("EXTENSION_IDS")
  if (env.LEARNHOUSE_GROUP_UUIDS.length === 0) missing.push("LEARNHOUSE_GROUP_UUIDS")
  if (missing.length > 0) {
    if (production) throw new Error(`Missing environment variables: ${missing.join(", ")}`)
    console.warn(`[env] not set (related features disabled): ${missing.join(", ")}`)
  }
  return env
}
