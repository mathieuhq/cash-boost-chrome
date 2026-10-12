import { DEFAULT_REMOTE_CONFIG } from "@super-x/contracts"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { ADMIN_EMAIL, createTestBackend, type TestBackend } from "./test-harness"

let t: TestBackend
let admin: Awaited<ReturnType<TestBackend["webSignIn"]>>

beforeAll(async () => {
  t = await createTestBackend()
  admin = await t.webSignIn(ADMIN_EMAIL)
})
afterAll(() => t.close())

describe("admin access", () => {
  it("403 when signed out or not admin", async () => {
    const anonymous = await t.request("/admin")
    expect(anonymous.status).toBe(403)
    expect(await anonymous.text()).toContain("Se connecter avec Google")
    const user = await t.webSignIn("someone@example.com")
    for (const path of ["/admin", "/admin/config", "/admin/errors"]) expect((await user.get(path)).status).toBe(403)
    expect((await user.post("/admin/config", { config: "{}" })).status).toBe(403)
  })

  it("redirects admin sign-in back to /admin", async () => {
    const login = await t.request("/admin/login")
    expect(new URL(login.headers.get("location")!).origin).toBe("https://accounts.google.com")
    expect((await admin.get("/admin")).status).toBe(200)
  })
})

describe("users", () => {
  it("lists users with their status and applies grant / revoke / clear", async () => {
    const client = await t.signIn("member@example.com")
    const page = await (await admin.get("/admin?q=member")).text()
    expect(page).toContain("member@example.com")
    expect(page).toContain(client.browserId)
    expect(page).toContain("Aucun")

    const userId = /\/admin\/users\/([^/]+)\/override/.exec(page)![1]!
    const grant = await admin.post(`/admin/users/${userId}/override`, { override: "grant", q: "member" })
    expect(grant.status).toBe(303)
    expect(grant.headers.get("location")).toBe("/admin?q=member")
    const meResponse = await client.call("/api/me")
    expect(((await meResponse.json()) as { entitlement: { kind: string } }).entitlement.kind).toBe("student")

    await admin.post(`/admin/users/${userId}/override`, { override: "revoke" })
    expect(await (await admin.get("/admin?q=member")).text()).toContain("accès retiré")
    await admin.post(`/admin/users/${userId}/override`, { override: "clear" })
    expect(await (await admin.get("/admin?q=member")).text()).not.toContain("accès retiré")
  })

  it("unlinks a student email", async () => {
    t.learnhouse.members.add("unlink@ecole.fr")
    const client = await t.signIn("unlink@example.com")
    await client.call("/api/student/link", { body: { email: "unlink@ecole.fr" } })
    await client.call("/api/student/verify", { body: { code: t.mailer.lastCode() } })
    const page = await (await admin.get("/admin?q=unlink")).text()
    expect(page).toContain("achat Growth Boost : unlink@ecole.fr")

    const userId = /\/admin\/users\/([^/]+)\/student\/unlink/.exec(page)![1]!
    expect((await admin.post(`/admin/users/${userId}/student/unlink`, { q: "unlink" })).status).toBe(303)
    expect(await (await admin.get("/admin?q=unlink")).text()).not.toContain("unlink@ecole.fr")
    const other = await t.signIn("other-unlink@example.com")
    expect((await other.call("/api/student/link", { body: { email: "unlink@ecole.fr" } })).status).toBe(200)
  })

  it("rejects cross-site form posts", async () => {
    const forged = await admin.post("/admin/users/x/override", { override: "grant" }, "https://evil.test")
    expect(forged.status).toBe(403)
    const noOrigin = await admin.post("/admin/users/x/override", { override: "grant" }, null)
    expect(noOrigin.status).toBe(403)
  })
})

describe("remote config", () => {
  it("saves a new version assigned by the server and serves it", async () => {
    const editor = await (await admin.get("/admin/config")).text()
    expect(editor).toContain("version 0")
    const config = { ...DEFAULT_REMOTE_CONFIG, version: 42, killSwitch: true }
    const saved = await admin.post("/admin/config", { config: JSON.stringify(config) })
    expect(saved.status).toBe(303)
    expect(saved.headers.get("location")).toBe("/admin/config?saved=1")
    expect(await (await t.request("/api/config")).json()).toEqual({ ...config, version: 1 })
    expect(await (await admin.get("/admin/config?saved=1")).text()).toContain("Version 1 enregistrée")
  })

  it("refuses invalid JSON or an invalid config", async () => {
    const invalidJson = await admin.post("/admin/config", { config: "{nope" })
    expect(invalidJson.status).toBe(400)
    expect(await invalidJson.text()).toContain("JSON invalide")
    const invalid = await admin.post("/admin/config", { config: JSON.stringify({ ...DEFAULT_REMOTE_CONFIG, killSwitch: "yes" }) })
    expect(invalid.status).toBe(400)
    expect(await invalid.text()).toContain("killSwitch")
  })

  it("escapes what it renders", async () => {
    const invalid = await admin.post("/admin/config", { config: "<script>alert(1)</script>" })
    expect(await invalid.text()).toContain("&lt;script&gt;")
  })
})

describe("errors", () => {
  it("shows error counts by config version", async () => {
    const client = await t.signIn("reporter@example.com")
    await client.call("/api/errors", { body: { configVersion: 3, extensionVersion: "0.2.0", codes: [{ code: "326", count: 4 }] } })
    const page = await (await admin.get("/admin/errors")).text()
    expect(page).toContain("Config v3")
    expect(page).toContain("326")
  })
})
