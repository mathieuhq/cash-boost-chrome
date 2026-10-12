import { MeResponse } from "@super-x/contracts"
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { session, user } from "../adapters/db/schema"
import { BASE, createTestBackend, EXTENSION_ORIGIN, REDIRECT_URI, type TestBackend } from "./test-harness"

let t: TestBackend
let n = 0
const email = () => `user${++n}@example.com`

beforeAll(async () => {
  t = await createTestBackend()
})
afterAll(() => t.close())

describe("extension sign-in", () => {
  it("redirects to Google with Better Auth's state cookie and our pending cookie", async () => {
    const browserId = crypto.randomUUID()
    const { start, callback, location } = await t.extensionRedirect(email(), browserId)
    expect(start.status).toBe(302)
    const google = new URL(start.headers.get("location")!)
    expect(google.origin).toBe("https://accounts.google.com")
    expect(google.searchParams.get("redirect_uri")).toBe(`${BASE}/api/auth/callback/google`)
    const cookies = start.headers.getSetCookie().join("\n")
    expect(cookies).toContain("better-auth.state=")
    expect(cookies).toContain("sx_ext_auth=")
    expect(callback.headers.get("location")).toBe(`${BASE}/ext/auth/finish`)
    expect(location).toMatch(new RegExp(`^${REDIRECT_URI}#code=[\\w-]+$`))
  })

  it("rejects a redirect_uri that isn't the extension's, or a bad browser id", async () => {
    const browserId = crypto.randomUUID()
    const evil = await t.request(`/ext/auth/start?redirect_uri=${encodeURIComponent("https://evil.chromiumapp.org/")}&browser_id=${browserId}`)
    expect(evil.status).toBe(400)
    expect(await evil.text()).toContain("Lien de connexion invalide")
    const badId = await t.request(`/ext/auth/start?redirect_uri=${encodeURIComponent(REDIRECT_URI)}&browser_id=nope`)
    expect(badId.status).toBe(400)
  })

  it("finish without the pending cookie is a 400 page; a Google error goes back as #error", async () => {
    expect((await t.request("/ext/auth/finish")).status).toBe(400)
    const start = await t.request(`/ext/auth/start?redirect_uri=${encodeURIComponent(REDIRECT_URI)}&browser_id=${crypto.randomUUID()}`)
    const cookie = start.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ")
    const finish = await t.request("/ext/auth/finish?error=access_denied", { headers: { cookie } })
    expect(finish.headers.get("location")).toBe(`${REDIRECT_URI}#error=access_denied`)
  })

  it("exchanges the code once for a signed bearer token usable on the API", async () => {
    const browserId = crypto.randomUUID()
    const address = email()
    const { location } = await t.extensionRedirect(address, browserId)
    const code = new URLSearchParams(new URL(location).hash.slice(1)).get("code")!

    const response = await t.exchange(code, browserId)
    expect(response.status).toBe(200)
    expect(response.headers.get("access-control-allow-origin")).toBe(EXTENSION_ORIGIN)
    const { token } = (await response.json()) as { token: string }
    expect(token).toContain(".")

    const me = await t.request("/api/me", { headers: { authorization: `Bearer ${token}`, "x-super-x-browser": browserId } })
    expect(me.status).toBe(200)
    const body = MeResponse.parse(await me.json())
    expect(body.account.email).toBe(address)
    expect(body.entitlement).toEqual({ kind: "none", trialAvailable: true })

    const replay = await t.exchange(code, browserId)
    expect(replay.status).toBe(401)
    expect(await replay.json()).toEqual({ error: "unauthorized", message: "invalid_code" })
  })

  it("blocks the public one-time-token verify endpoint", async () => {
    const response = await t.request("/api/auth/one-time-token/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "x" }),
    })
    expect(response.status).toBe(404)
  })

  it("refuses the raw (unsigned) session token", async () => {
    const client = await t.signIn(email())
    const raw = client.token.split(".")[0]!
    const me = await t.request("/api/me", { headers: { authorization: `Bearer ${raw}`, "x-super-x-browser": client.browserId } })
    expect(me.status).toBe(401)
    expect(await me.json()).toEqual({ error: "unauthorized" })
  })

  it("validates the exchange body", async () => {
    const response = await t.exchange("code", "not-a-uuid")
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: "invalid_request" })
  })

  it("needs Better Auth's state cookie on the Google callback", async () => {
    const start = await t.request(`/ext/auth/start?redirect_uri=${encodeURIComponent(REDIRECT_URI)}&browser_id=${crypto.randomUUID()}`)
    const state = new URL(start.headers.get("location")!).searchParams.get("state")!
    const callback = await t.request(`/api/auth/callback/google?state=${state}&code=${encodeURIComponent(email())}`)
    expect(callback.headers.getSetCookie().join("\n")).not.toContain("session_token=")
  })

  it("gives role admin to a new user in ADMIN_EMAILS", async () => {
    const client = await t.signIn("boss@example.com")
    const me = MeResponse.parse(await (await client.call("/api/me")).json())
    expect(me.account.role).toBe("admin")
  })
})

describe("ActiveBrowser", () => {
  it("requires the browser header", async () => {
    const client = await t.signIn(email())
    const response = await t.request("/api/me", { headers: { authorization: `Bearer ${client.token}` } })
    expect(response.status).toBe(400)
  })

  it("last login wins: the previous browser gets 409 browser_replaced", async () => {
    const address = email()
    const first = await t.signIn(address)
    const second = await t.signIn(address)
    expect((await second.call("/api/me")).status).toBe(200)
    const replaced = await first.call("/api/me")
    expect(replaced.status).toBe(409)
    expect(await replaced.json()).toEqual({ error: "browser_replaced" })
  })

  it("refuses a 4th browser change within a week and drops that session", async () => {
    const address = email()
    for (let i = 0; i < 4; i++) await t.signIn(address)
    const browserId = crypto.randomUUID()
    const { location } = await t.extensionRedirect(address, browserId)
    const code = new URLSearchParams(new URL(location).hash.slice(1)).get("code")!
    const [owner] = await t.db.select({ id: user.id }).from(user).where(eq(user.email, address))
    const before = await t.db.select().from(session).where(eq(session.userId, owner!.id))

    const response = await t.exchange(code, browserId)
    expect(response.status).toBe(429)
    expect(await response.json()).toEqual({ error: "browser_change_limit" })
    const after = await t.db.select().from(session).where(eq(session.userId, owner!.id))
    expect(after).toHaveLength(before.length - 1)
  })
})
