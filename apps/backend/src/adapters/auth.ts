import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { bearer, oneTimeToken } from "better-auth/plugins"
import { eq } from "drizzle-orm"

import { normalizeEmail } from "../domain"
import type { Database } from "./db/database"
import { authSchema, user } from "./db/schema"

export interface AuthOptions {
  db: Database
  baseUrl: string
  secret: string
  google: { clientId: string; clientSecret: string }
  /** `chrome-extension://<id>` origins. */
  trustedOrigins: string[]
  /** Promoted to role admin when they sign in. */
  adminEmails: string[]
}

/** Better Auth: Google only, signed bearer tokens for the extension, one-time tokens for the sign-in hand-off. */
export function createAuth(options: AuthOptions) {
  const admins = new Set(options.adminEmails.map(normalizeEmail))
  const isAdmin = (email: string) => admins.has(normalizeEmail(email))

  return betterAuth({
    baseURL: options.baseUrl,
    secret: options.secret,
    database: drizzleAdapter(options.db, { provider: "pg", schema: authSchema }),
    socialProviders: {
      google: { clientId: options.google.clientId, clientSecret: options.google.clientSecret, prompt: "select_account" },
    },
    trustedOrigins: options.trustedOrigins,
    // The extension stays signed in: each daily /api/me call slides the expiry.
    session: { expiresIn: 30 * 24 * 3600, updateAge: 24 * 3600 },
    user: {
      additionalFields: {
        role: { type: ["user", "admin"], required: false, defaultValue: "user", input: false },
      },
    },
    plugins: [
      // Only the signed `set-auth-token` value is accepted: a leaked raw session.token is useless.
      bearer({ requireSignature: true }),
      oneTimeToken({ disableClientRequest: true, storeToken: "hashed" }),
    ],
    databaseHooks: {
      user: {
        create: {
          before: async (data) => (isAdmin(data.email) ? { data: { ...data, role: "admin" } } : { data }),
        },
      },
      session: {
        create: {
          // Existing users added to ADMIN_EMAILS later are promoted on their next sign-in.
          after: async (session) => {
            const [row] = await options.db.select({ email: user.email, role: user.role }).from(user).where(eq(user.id, session.userId))
            if (row && row.role !== "admin" && isAdmin(row.email)) {
              await options.db.update(user).set({ role: "admin" }).where(eq(user.id, session.userId))
            }
          },
        },
      },
    },
    telemetry: { enabled: false },
  })
}

export type Auth = ReturnType<typeof createAuth>
