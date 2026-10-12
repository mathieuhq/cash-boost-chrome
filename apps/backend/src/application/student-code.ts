/** 6 uniformly random digits (Web Crypto). */
export function newStudentCode(): string {
  const limit = 4_294_000_000 // largest multiple of 1e6 below 2^32: no modulo bias
  let value: number
  do value = crypto.getRandomValues(new Uint32Array(1))[0]!
  while (value >= limit)
  return String(value % 1_000_000).padStart(6, "0")
}

/** SHA-256 bound to the Account and the email, so a stored hash only matches that pending link. */
export async function hashStudentCode(userId: string, email: string, code: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${userId}\n${email}\n${code}`))
  return Buffer.from(digest).toString("hex")
}
