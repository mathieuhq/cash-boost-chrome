// Full app on PGlite with faked external services; Google's token endpoint is stubbed on global fetch.
import { BROWSER_HEADER } from "@super-x/contracts"
import { vi } from "vitest"

import { createPgliteDatabase } from "../adapters/db/pglite"
import { FakeClock, FakeJev, FakeLearnHouse, FakeMailer, FakePayments } from "../application/testing/fakes"
import { Env } from "../env"
import { createBackend } from "../main"

export const BASE = "https://api.test"
export const EXTENSION_ID = "abcdefghijklmnopabcdefghijklmnop"
export const REDIRECT_URI = `https://${EXTENSION_ID}.chromiumapp.org/`
export const EXTENSION_ORIGIN = `chrome-extension://${EXTENSION_ID}`
export const ADMIN_EMAIL = "boss@example.com"

/** Minimal cookie jar keyed by cookie name (single host). */
export class CookieJar {
  readonly cookies = new Map<string, string>()
  store(response: Response) {
    for (const header of response.headers.getSetCookie()) {
      const [pair, ...attributes] = header.split(";")
      const index = pair!.indexOf("=")
      const name = pair!.slice(0, index).trim()
      const expired = attributes.some((a) => /^\s*max-age=0\s*$/i.test(a) || /^\s*expires=thu, 01 jan 1970/i.test(a))
      if (expired) this.cookies.delete(name)
      else this.cookies.set(name, pair!.slice(index + 1))
    }
  }
  header() {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ")
  }
}

function unsignedJwt(payload: Record<string, unknown>) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url")
  return `${encode({ alg: "RS256", typ: "JWT" })}.${encode(payload)}.sig`
}

export async function createTestBackend(options: { testAuth?: boolean } = {}) {
  const { db, close } = await createPgliteDatabase()
  const clock = new FakeClock(Date.now())
  const learnhouse = new FakeLearnHouse()
  const jev = new FakeJev()
  const payments = new FakePayments()
  const mailer = new FakeMailer()
  const env = Env.parse({
    BETTER_AUTH_URL: BASE,
    BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-123",
    GOOGLE_CLIENT_ID: "google-client",
    GOOGLE_CLIENT_SECRET: "google-secret",
    EXTENSION_IDS: EXTENSION_ID,
    ADMIN_EMAILS: ADMIN_EMAIL,
    LEARNHOUSE_GROUP_UUIDS: "ug_growth",
    SUPERX_TEST_AUTH: options.testAuth ? "1" : "",
  })
  const { app } = createBackend(env, db, { clock, learnhouse, jev, payments, mailer })

  // Google token endpoint: the authorization `code` is the email of the Google account signing in.
  const realFetch = globalThis.fetch
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input)
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      const email = new URLSearchParams(String(init?.body)).get("code")!
      const idToken = unsignedJwt({ sub: `google-${email}`, email, email_verified: true, name: email.split("@")[0], picture: null })
      return new Response(JSON.stringify({ access_token: "at", id_token: idToken, expires_in: 3600, token_type: "Bearer" }), {
        headers: { "content-type": "application/json" },
      })
    }
    if (url.startsWith(BASE)) throw new Error(`unexpected self fetch ${url}`)
    return realFetch(input, init)
  })

  const request = (path: string, init: RequestInit = {}) => app.request(`${BASE}${path}`, init)

  /** Follows Google's redirect back to the callback, as the browser would. */
  async function googleRoundTrip(googleUrl: string, email: string, jar: CookieJar) {
    const state = new URL(googleUrl).searchParams.get("state")!
    const callback = await request(`/api/auth/callback/google?state=${state}&code=${encodeURIComponent(email)}`, {
      headers: { cookie: jar.header() },
    })
    jar.store(callback)
    return callback
  }

  /** Extension flow up to the chromiumapp.org redirect. */
  async function extensionRedirect(email: string, browserId: string) {
    const jar = new CookieJar()
    const start = await request(`/ext/auth/start?redirect_uri=${encodeURIComponent(REDIRECT_URI)}&browser_id=${browserId}`)
    jar.store(start)
    const callback = await googleRoundTrip(start.headers.get("location")!, email, jar)
    const finish = await request(new URL(callback.headers.get("location")!).pathname, { headers: { cookie: jar.header() } })
    return { start, callback, finish, location: finish.headers.get("location")! }
  }

  function exchange(code: string, browserId: string) {
    return request("/ext/auth/exchange", {
      method: "POST",
      headers: { "content-type": "application/json", origin: EXTENSION_ORIGIN },
      body: JSON.stringify({ code, browserId }),
    })
  }

  /** Full extension sign-in; returns a client sending the bearer token and browser id. */
  async function signIn(email: string, browserId: string = crypto.randomUUID()) {
    const { location } = await extensionRedirect(email, browserId)
    const code = new URLSearchParams(new URL(location).hash.slice(1)).get("code")!
    const response = await exchange(code, browserId)
    if (response.status !== 200) throw new Error(`exchange ${response.status} ${await response.text()}`)
    const { token } = (await response.json()) as { token: string }
    const call = (path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) =>
      request(path, {
        method: init.method ?? (init.body === undefined ? "GET" : "POST"),
        headers: {
          authorization: `Bearer ${token}`,
          [BROWSER_HEADER]: browserId,
          ...(init.body === undefined ? {} : { "content-type": "application/json" }),
          ...init.headers,
        },
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      })
    return { token, browserId, call }
  }

  /** Admin web sign-in (cookie session). */
  async function webSignIn(email: string) {
    const jar = new CookieJar()
    const login = await request("/admin/login")
    jar.store(login)
    await googleRoundTrip(login.headers.get("location")!, email, jar)
    return {
      jar,
      get: (path: string) => request(path, { headers: { cookie: jar.header() } }),
      post: (path: string, form: Record<string, string>, origin: string | null = BASE) =>
        request(path, {
          method: "POST",
          headers: {
            cookie: jar.header(),
            "content-type": "application/x-www-form-urlencoded",
            ...(origin ? { origin } : {}),
          },
          body: new URLSearchParams(form).toString(),
        }),
    }
  }

  return {
    app,
    db,
    clock,
    learnhouse,
    jev,
    payments,
    mailer,
    request,
    extensionRedirect,
    exchange,
    signIn,
    webSignIn,
    close: async () => {
      vi.unstubAllGlobals()
      await close()
    },
  }
}

export type TestBackend = Awaited<ReturnType<typeof createTestBackend>>
