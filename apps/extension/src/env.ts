// Build-time configuration (.env → PLASMO_PUBLIC_*), inlined by Plasmo.
declare const process: { env: Record<string, string | undefined> }

export const BACKEND_URL = process.env.PLASMO_PUBLIC_BACKEND_URL ?? "http://localhost:8787"
/** `pnpm dev --test`: sign in with the local backend's test account instead of Google. */
export const TEST_AUTH = process.env.PLASMO_PUBLIC_TEST_AUTH === "1"
