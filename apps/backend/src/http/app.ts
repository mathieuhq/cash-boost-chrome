import { BROWSER_HEADER } from "@super-x/contracts"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { HTTPException } from "hono/http-exception"

import { AppError } from "../application"
import { adminRoutes } from "./admin"
import { apiRoutes } from "./api"
import type { AppDeps, AppEnv } from "./context"
import { extAuthRoutes } from "./ext-auth"
import { testAuthRoutes } from "./test-auth"
import { message } from "./pages"

export type { AppDeps } from "./context"

export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>()
  const extensionOrigins = deps.extensionIds.map((id) => `chrome-extension://${id}`)

  const extensionCors = cors({
    origin: extensionOrigins,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["authorization", "content-type", BROWSER_HEADER],
    exposeHeaders: ["set-auth-token"],
    maxAge: 600,
  })
  app.use("/api/*", extensionCors)
  app.use("/ext/auth/exchange", extensionCors)

  app.onError((error, c) => {
    if (error instanceof AppError) {
      return c.json({ error: error.code, ...(error.message === error.code ? {} : { message: error.message }) }, error.status)
    }
    if (error instanceof HTTPException) return error.getResponse()
    // Only the error itself: request bodies (comment text) are never logged.
    console.error(error)
    return c.json({ error: "upstream_unavailable", message: "internal_error" }, 500)
  })
  app.notFound((c) => c.json({ error: "invalid_request", message: "not_found" }, 404))

  app.get("/healthz", (c) => c.json({ ok: true }))

  // Only reachable through /ext/auth/exchange, which also registers the ActiveBrowser.
  app.all("/api/auth/one-time-token/*", (c) => c.json({ error: "invalid_request", message: "not_found" }, 404))
  app.on(["GET", "POST"], "/api/auth/*", (c) => deps.auth.handler(c.req.raw))

  if (deps.testAuth) app.route("/", testAuthRoutes(deps))
  app.route("/ext/auth", extAuthRoutes(deps))
  app.route("/api", apiRoutes(deps))
  app.route("/admin", adminRoutes(deps))

  app.get("/checkout/success", (c) =>
    c.html(message("Paiement reçu", "Merci ! Retourne dans l'extension Cash Boost : ton accès est activé."))
  )
  app.get("/checkout/cancel", (c) =>
    c.html(message("Paiement annulé", "Aucun montant n'a été débité. Tu peux reprendre l'achat depuis l'extension."))
  )

  return app
}
