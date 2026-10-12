import { AuthExchangeRequest, type AuthExchangeResponse } from "@super-x/contracts"
import { Hono } from "hono"
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie"
import { z } from "zod"

import { AppError } from "../application"
import { jsonBody, type AppDeps, type AppEnv } from "./context"
import { message } from "./pages"

const COOKIE = "sx_ext_auth"
const COOKIE_PATH = "/ext/auth"

const Pending = z.object({ redirectUri: z.string(), browserId: z.uuid() })

/**
 * Google sign-in for the extension without third-party cookies (docs/research/backend-auth-stripe.md §3):
 * start → Google → /api/auth/callback/google → finish → chromiumapp.org#code=<one-time token> → exchange.
 */
export function extAuthRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>()
  const redirectUris = new Set(deps.extensionIds.map((id) => `https://${id}.chromiumapp.org/`))
  const finishUrl = `${deps.baseUrl}/ext/auth/finish`
  const secure = deps.baseUrl.startsWith("https:")

  app.get("/start", async (c) => {
    const redirectUri = c.req.query("redirect_uri") ?? ""
    const browserId = c.req.query("browser_id") ?? ""
    if (!redirectUris.has(redirectUri) || !z.uuid().safeParse(browserId).success) {
      return c.html(message("Lien de connexion invalide", "Relance la connexion depuis l'extension Cash Boost."), 400)
    }
    // callbackURL is not validated on server-side calls: it must stay hard-coded.
    let signIn
    try {
      signIn = await deps.auth.api.signInSocial({
        body: { provider: "google", callbackURL: finishUrl, errorCallbackURL: finishUrl, disableRedirect: true },
        returnHeaders: true,
      })
    } catch {
      // Typically GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET missing.
      return c.html(message("Connexion Google indisponible", "Réessaie dans un instant depuis l'extension Cash Boost."), 503)
    }
    const { headers, response } = signIn
    if (!response.url) throw new AppError("upstream_unavailable", 502, "google")
    await setSignedCookie(c, COOKIE, JSON.stringify({ redirectUri, browserId }), deps.secret, {
      path: COOKIE_PATH,
      httpOnly: true,
      secure,
      sameSite: "Lax",
      maxAge: 600,
    })
    // Better Auth's OAuth state cookie: the callback rejects the sign-in without it.
    for (const cookie of headers.getSetCookie()) c.header("set-cookie", cookie, { append: true })
    return c.redirect(response.url, 302)
  })

  app.get("/finish", async (c) => {
    const raw = await getSignedCookie(c, deps.secret, COOKIE)
    const pending = raw ? Pending.safeParse(JSON.parse(raw)) : undefined
    if (!pending?.success || !redirectUris.has(pending.data.redirectUri)) {
      return c.html(message("Connexion expirée", "Relance la connexion depuis l'extension Cash Boost."), 400)
    }
    deleteCookie(c, COOKIE, { path: COOKIE_PATH, secure })
    const target = pending.data.redirectUri
    const error = c.req.query("error")
    if (error) return c.redirect(`${target}#error=${encodeURIComponent(error)}`, 302)
    try {
      const { token } = await deps.auth.api.generateOneTimeToken({ headers: c.req.raw.headers })
      return c.redirect(`${target}#code=${encodeURIComponent(token)}`, 302)
    } catch {
      return c.redirect(`${target}#error=no_session`, 302)
    }
  })

  app.post("/exchange", async (c) => {
    const { code, browserId } = await jsonBody(c, AuthExchangeRequest)
    // The public verify endpoint is blocked (app.ts): the browser must be registered with the token.
    const verified = await deps.auth.handler(
      new Request(`${deps.baseUrl}/api/auth/one-time-token/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: code }),
      })
    )
    const token = verified.headers.get("set-auth-token")
    if (!verified.ok || !token) throw new AppError("unauthorized", 401, "invalid_code")
    const { session } = (await verified.json()) as { session: { token: string; userId: string } }
    try {
      await deps.access.registerBrowser(session.userId, browserId)
    } catch (error) {
      // Don't leave a usable session behind a refused sign-in.
      await (await deps.auth.$context).internalAdapter.deleteSession(session.token)
      throw error
    }
    return c.json({ token } satisfies AuthExchangeResponse)
  })

  return app
}
