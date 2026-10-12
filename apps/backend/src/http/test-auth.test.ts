import { BROWSER_HEADER } from "@super-x/contracts"
import { afterEach, describe, expect, it } from "vitest"

import { parseEnv } from "../env"
import { CookieJar, createTestBackend, type TestBackend } from "./test-harness"

let backend: TestBackend | undefined
afterEach(async () => {
  await backend?.close()
  backend = undefined
})

const browserId = "6f1c2a52-5d0e-4a8c-9a51-2a1f3f2b9c10"
const testSignIn = (b: TestBackend) =>
  b.request("/ext/auth/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ browserId }),
  })

describe("test sign-in (pnpm dev --test)", () => {
  it("does not exist without the flag", async () => {
    backend = await createTestBackend()
    expect((await testSignIn(backend)).status).toBe(404)
    expect((await backend.request("/admin/test-login")).status).not.toBe(302)
  })

  it("returns a bearer token accepted by the API", async () => {
    backend = await createTestBackend({ testAuth: true })
    const response = await testSignIn(backend)
    expect(response.status).toBe(200)
    const { token } = (await response.json()) as { token: string }
    const me = await backend.request("/api/me", { headers: { authorization: `Bearer ${token}`, [BROWSER_HEADER]: browserId } })
    expect(me.status).toBe(200)
    expect(await me.json()).toMatchObject({ account: { email: "test@superx.local", role: "admin" }, entitlement: { trialAvailable: true } })
  })

  it("signs into /admin with a cookie", async () => {
    backend = await createTestBackend({ testAuth: true })
    const jar = new CookieJar()
    const login = await backend.request("/admin/test-login")
    expect(login.status).toBe(302)
    jar.store(login)
    const admin = await backend.request("/admin", { headers: { cookie: jar.header() } })
    expect(admin.status).toBe(200)
  })

  it("is refused in production", () => {
    expect(() =>
      parseEnv({ BETTER_AUTH_SECRET: "x".repeat(32), EXTENSION_IDS: "a".repeat(32), SUPERX_TEST_AUTH: "1" }, true)
    ).toThrow(/local dev only/)
  })
})
