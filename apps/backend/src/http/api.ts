import {
  BROWSER_HEADER,
  ClassifyRequest,
  ErrorReport,
  StartTrialRequest,
  StudentLinkRequest,
  StudentVerifyRequest,
} from "@super-x/contracts"
import { Hono } from "hono"
import { createMiddleware } from "hono/factory"

import { AppError } from "../application"
import { jsonBody, type AppDeps, type AppEnv } from "./context"

/** Extension API (bearer session + ActiveBrowser check), plus the public config and Stripe webhook. */
export function apiRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>()

  const authenticated = createMiddleware<AppEnv>(async (c, next) => {
    const session = await deps.auth.api.getSession({ headers: c.req.raw.headers })
    if (!session) throw new AppError("unauthorized", 401)
    const browserId = c.req.header(BROWSER_HEADER)
    if (!browserId) throw new AppError("invalid_request", 400, `missing ${BROWSER_HEADER}`)
    await deps.access.checkBrowser(session.user.id, browserId)
    c.set("userId", session.user.id)
    await next()
  })

  // Public: the kill switch must reach signed-out extensions too.
  app.get("/config", async (c) => c.json(await deps.config.current()))

  app.get("/me", authenticated, async (c) => c.json(await deps.access.me(c.get("userId"))))

  app.post("/trial/start", authenticated, async (c) => {
    const { xUserId } = await jsonBody(c, StartTrialRequest)
    return c.json(await deps.access.startTrial(c.get("userId"), xUserId))
  })

  app.post("/classify", authenticated, async (c) => {
    const request = await jsonBody(c, ClassifyRequest)
    return c.json(await deps.classify.classify(c.get("userId"), request))
  })

  app.post("/errors", authenticated, async (c) => {
    await deps.config.reportErrors(await jsonBody(c, ErrorReport))
    return c.json({ ok: true as const })
  })

  app.post("/checkout", authenticated, async (c) => c.json(await deps.billing.checkout(c.get("userId"))))

  app.post("/student/link", authenticated, async (c) => {
    const { email } = await jsonBody(c, StudentLinkRequest)
    return c.json(await deps.access.requestStudentCode(c.get("userId"), email))
  })

  app.post("/student/verify", authenticated, async (c) => {
    const { code } = await jsonBody(c, StudentVerifyRequest)
    return c.json(await deps.access.verifyStudentCode(c.get("userId"), code))
  })

  app.post("/stripe/webhook", async (c) => {
    const signature = c.req.header("stripe-signature")
    if (!signature) throw new AppError("invalid_request", 400, "missing stripe-signature")
    // Raw body: the signature covers the exact bytes.
    await deps.billing.handleWebhook(await c.req.text(), signature)
    return c.json({ received: true })
  })

  return app
}
