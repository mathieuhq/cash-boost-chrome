import { DEFAULT_REMOTE_CONFIG, Entitlement, MeResponse, StudentCodeSent } from "@super-x/contracts"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { TRIAL_DURATION } from "../domain"
import { createTestBackend, EXTENSION_ORIGIN, type TestBackend } from "./test-harness"

let t: TestBackend
let n = 0
const email = () => `api${++n}@example.com`

beforeAll(async () => {
  t = await createTestBackend()
})
afterAll(() => t.close())

const me = async (client: Awaited<ReturnType<TestBackend["signIn"]>>) => MeResponse.parse(await (await client.call("/api/me")).json())

describe("public routes", () => {
  it("healthz", async () => {
    expect(await (await t.request("/healthz")).json()).toEqual({ ok: true })
  })

  it("serves the default RemoteConfig without auth", async () => {
    expect(await (await t.request("/api/config")).json()).toEqual(DEFAULT_REMOTE_CONFIG)
  })

  it("answers CORS preflights from the extension and exposes set-auth-token", async () => {
    const preflight = await t.request("/api/me", {
      method: "OPTIONS",
      headers: { origin: EXTENSION_ORIGIN, "access-control-request-method": "GET", "access-control-request-headers": "authorization,x-super-x-browser" },
    })
    expect(preflight.headers.get("access-control-allow-origin")).toBe(EXTENSION_ORIGIN)
    expect(preflight.headers.get("access-control-allow-headers")).toContain("x-super-x-browser")
    const response = await t.request("/api/config", { headers: { origin: EXTENSION_ORIGIN } })
    expect(response.headers.get("access-control-expose-headers")).toContain("set-auth-token")
    const other = await t.request("/api/config", { headers: { origin: "https://evil.test" } })
    expect(other.headers.get("access-control-allow-origin")).toBeNull()
  })

  it("serves the French checkout pages", async () => {
    expect(await (await t.request("/checkout/success")).text()).toContain("Paiement reçu")
    expect(await (await t.request("/checkout/cancel")).text()).toContain("Paiement annulé")
  })

  it("401 without a session", async () => {
    const response = await t.request("/api/me")
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: "unauthorized" })
  })
})

describe("Trial", () => {
  it("starts once per Google account and per X account", async () => {
    const client = await t.signIn(email())
    const started = await client.call("/api/trial/start", { body: { xUserId: "1001" } })
    expect(started.status).toBe(200)
    expect(Entitlement.parse(await started.json())).toEqual({
      kind: "trial",
      trialEndsAt: t.clock.now() + TRIAL_DURATION,
      trialAvailable: false,
    })
    expect((await client.call("/api/trial/start", { body: { xUserId: "1001" } })).status).toBe(200)
    expect((await me(client)).entitlement.kind).toBe("trial")

    const other = await client.call("/api/trial/start", { body: { xUserId: "1002" } })
    expect(other.status).toBe(409)
    expect(await other.json()).toMatchObject({ error: "trial_used" })

    const someoneElse = await t.signIn(email())
    const reused = await someoneElse.call("/api/trial/start", { body: { xUserId: "1001" } })
    expect(reused.status).toBe(409)
  })

  it("400 on an invalid X user id", async () => {
    const client = await t.signIn(email())
    const response = await client.call("/api/trial/start", { body: { xUserId: "@handle" } })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: "invalid_request", message: "invalid xUserId" })
  })
})

describe("classify", () => {
  const body = { keyword: "GUIDE", comments: [{ id: "a", text: "GUIDE stp" }, { id: "b", text: "nice" }] }

  it("403 without entitlement", async () => {
    const client = await t.signIn(email())
    const response = await client.call("/api/classify", { body })
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: "no_entitlement" })
  })

  it("classifies for an entitled user and reports the remaining quota", async () => {
    const client = await t.signIn(email())
    await client.call("/api/trial/start", { body: { xUserId: "2001" } })
    t.jev.answer = (text) => (text.includes("GUIDE") ? 0.92 : 0.05)
    const response = await client.call("/api/classify", { body })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      results: [
        { id: "a", probability: 0.92 },
        { id: "b", probability: 0.05 },
      ],
      remainingToday: 1998,
    })
  })

  it("502 when Jev is down; 400 on a batch over 25", async () => {
    const client = await t.signIn(email())
    await client.call("/api/trial/start", { body: { xUserId: "2002" } })
    t.jev.down = true
    const down = await client.call("/api/classify", { body })
    t.jev.down = false
    expect(down.status).toBe(502)
    expect(await down.json()).toEqual({ error: "upstream_unavailable" })
    const tooMany = { keyword: "GUIDE", comments: Array.from({ length: 26 }, (_, i) => ({ id: `${i}`, text: "x" })) }
    expect((await client.call("/api/classify", { body: tooMany })).status).toBe(400)
  })
})

describe("errors", () => {
  it("accepts an ErrorReport", async () => {
    const client = await t.signIn(email())
    const response = await client.call("/api/errors", {
      body: { configVersion: 0, extensionVersion: "0.1.0", codes: [{ code: "88", count: 2 }] },
    })
    expect(await response.json()).toEqual({ ok: true })
  })
})

describe("checkout and Stripe webhook", () => {
  it("returns a Checkout URL, grants on payment and revokes on refund", async () => {
    const client = await t.signIn(email())
    const userId = (await me(client)).account.id
    const checkout = await client.call("/api/checkout", { method: "POST" })
    expect(await checkout.json()).toEqual({ url: `https://checkout.stripe.test/${userId}` })

    const webhook = (event: unknown, signature = "valid") =>
      t.request("/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": signature }, body: JSON.stringify(event) })
    const paid = { type: "paid", userId, checkoutSessionId: `cs_${userId}`, paymentIntentId: `pi_${userId}`, amount: 9900, currency: "eur" }
    expect((await webhook(paid)).status).toBe(200)
    expect((await webhook(paid)).status).toBe(200)
    expect((await me(client)).entitlement.kind).toBe("paid")

    const again = await client.call("/api/checkout", { method: "POST" })
    expect(again.status).toBe(409)
    expect(await again.json()).toEqual({ error: "invalid_request", message: "already_paid" })

    expect((await webhook({ type: "refunded", paymentIntentId: `pi_${userId}` })).status).toBe(200)
    expect((await me(client)).entitlement.kind).toBe("none")
  })

  it("400 on a bad or missing signature", async () => {
    expect((await t.request("/api/stripe/webhook", { method: "POST", body: "{}" })).status).toBe(400)
    const forged = await t.request("/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": "forged" }, body: "{}" })
    expect(forged.status).toBe(400)
  })
})

describe("students", () => {
  it("matches by Google email on /api/me", async () => {
    const address = email()
    t.learnhouse.members.add(address)
    const client = await t.signIn(address)
    const body = await me(client)
    expect(body.entitlement.kind).toBe("student")
    expect(body.studentEmail).toBe(address)
  })

  it("links a purchase email with the emailed code, locked to one account", async () => {
    const client = await t.signIn(email())
    const notMember = await client.call("/api/student/link", { body: { email: "eleve@ecole.fr" } })
    expect(notMember.status).toBe(404)
    expect(await notMember.json()).toEqual({ error: "student_not_found" })

    t.learnhouse.members.add("eleve@ecole.fr")
    const sent = await client.call("/api/student/link", { body: { email: "Eleve@Ecole.fr" } })
    expect(sent.status).toBe(200)
    expect(StudentCodeSent.parse(await sent.json()).email).toBe("eleve@ecole.fr")
    expect(t.mailer.sent.at(-1)!.to).toBe("eleve@ecole.fr")

    const wrong = await client.call("/api/student/verify", { body: { code: t.mailer.lastCode() === "000000" ? "111111" : "000000" } })
    expect(wrong.status).toBe(400)
    expect(await wrong.json()).toEqual({ error: "student_code_invalid" })

    const linked = await client.call("/api/student/verify", { body: { code: t.mailer.lastCode() } })
    expect(linked.status).toBe(200)
    const body = MeResponse.parse(await linked.json())
    expect(body.entitlement.kind).toBe("student")
    expect(body.studentEmail).toBe("eleve@ecole.fr")

    const other = await t.signIn(email())
    const taken = await other.call("/api/student/link", { body: { email: "eleve@ecole.fr" } })
    expect(taken.status).toBe(409)
    expect(await taken.json()).toEqual({ error: "student_email_taken" })

    expect((await client.call("/api/student/link", { body: { email: "not-an-email" } })).status).toBe(400)
    expect((await client.call("/api/student/verify", { body: { code: "12ab" } })).status).toBe(400)
  })
})
