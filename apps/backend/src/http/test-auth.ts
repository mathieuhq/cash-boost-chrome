import { makeSignature } from "better-auth/crypto"
import { Hono } from "hono"
import { setCookie } from "hono/cookie"
import { z } from "zod"

import { jsonBody, type AppDeps, type AppEnv } from "./context"

/** The account every test sign-in uses (admin, so /admin works without Google too). */
export const TEST_ACCOUNT = { email: "test@superx.local", name: "Compte de test" }

/**
 * Sign-in without Google, mounted only when the backend runs with SUPERX_TEST_AUTH=1 (`pnpm dev --test`).
 * parseEnv refuses the flag in production.
 */
export function testAuthRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>()

  /** Same signed value as Better Auth's session cookie and `set-auth-token`. */
  async function testSession() {
    const ctx = await deps.auth.$context
    const found = await ctx.internalAdapter.findUserByEmail(TEST_ACCOUNT.email)
    const user = found?.user ?? (await ctx.internalAdapter.createUser({ ...TEST_ACCOUNT, emailVerified: true }, { method: "test" }))
    await ctx.internalAdapter.updateUser(user.id, { role: "admin" })
    const session = await ctx.internalAdapter.createSession(user.id, false)
    return { userId: user.id, signed: `${session.token}.${await makeSignature(session.token, ctx.secret)}` }
  }

  app.post("/ext/auth/test", async (c) => {
    const { browserId } = await jsonBody(c, z.object({ browserId: z.uuid() }))
    const { userId, signed } = await testSession()
    await deps.access.registerBrowser(userId, browserId)
    return c.json({ token: signed })
  })

  app.get("/admin/test-login", async (c) => {
    const { signed } = await testSession()
    const ctx = await deps.auth.$context
    setCookie(c, ctx.authCookies.sessionToken.name, signed, { path: "/", httpOnly: true, sameSite: "Lax", secure: deps.baseUrl.startsWith("https:") })
    return c.redirect("/admin", 302)
  })

  return app
}
