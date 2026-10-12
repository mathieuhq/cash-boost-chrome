import { BackendError, type BackendClient } from "@super-x/adapters-backend"
import {
  CheckoutResponse,
  MeResponse,
  StudentCodeSent,
  type StudentLinkRequest,
  type StudentVerifyRequest,
} from "@super-x/contracts"
import * as z from "zod"

export type SignInResult = { ok: true } | { ok: false; error: string }

/**
 * Google sign-in without third-party cookies: the backend runs Better Auth's Google flow in the
 * identity window and hands back a one-time code, exchanged for a signed bearer token.
 */
export async function signInWithGoogle(client: BackendClient): Promise<SignInResult> {
  const browserId = await client.browserId()
  const redirectUri = chrome.identity.getRedirectURL()
  const start = new URL(`${client.baseUrl}/ext/auth/start`)
  start.searchParams.set("redirect_uri", redirectUri)
  start.searchParams.set("browser_id", browserId)

  let finalUrl: string | undefined
  try {
    finalUrl = await chrome.identity.launchWebAuthFlow({ url: start.toString(), interactive: true })
  } catch {
    return { ok: false, error: "cancelled" }
  }
  if (!finalUrl) return { ok: false, error: "cancelled" }

  const params = new URLSearchParams(new URL(finalUrl).hash.slice(1))
  const code = params.get("code")
  if (!code) return { ok: false, error: params.get("error") ?? "no_code" }

  try {
    const { token } = await client.post("/ext/auth/exchange", z.object({ token: z.string().min(1) }), { code, browserId })
    await client.signIn(token)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof BackendError ? error.code : "exchange_failed" }
  }
}

/** `pnpm dev --test`: the local backend signs in a test account, no Google window. */
export async function signInForTest(client: BackendClient): Promise<SignInResult> {
  try {
    const browserId = await client.browserId()
    const { token } = await client.post("/ext/auth/test", z.object({ token: z.string().min(1) }), { browserId })
    await client.signIn(token)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof BackendError ? error.code : "exchange_failed" }
  }
}

/** "Lier mon achat Growth Boost", step 1: the backend checks the purchase email and emails it a code. */
export async function requestStudentCode(client: BackendClient, email: string): Promise<SignInResult> {
  try {
    await client.request("/api/student/link", StudentCodeSent, { body: { email } satisfies StudentLinkRequest })
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof BackendError ? error.code : "link_failed" }
  }
}

/** Step 2: the emailed code locks the purchase email to this Account. */
export async function verifyStudentCode(client: BackendClient, code: string): Promise<SignInResult> {
  try {
    await client.request("/api/student/verify", MeResponse, { body: { code } satisfies StudentVerifyRequest })
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof BackendError ? error.code : "link_failed" }
  }
}

/** Opens Stripe Checkout in a new tab. */
export async function openCheckout(client: BackendClient): Promise<SignInResult> {
  try {
    const { url } = await client.request("/api/checkout", CheckoutResponse, { method: "POST", body: {} })
    await chrome.tabs.create({ url })
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof BackendError ? error.code : "checkout_failed" }
  }
}
