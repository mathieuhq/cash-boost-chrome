import { describe, expect, it } from "vitest"

import { parseEnv } from "./env"

const base = { BETTER_AUTH_SECRET: "x".repeat(32) }
const full = {
  ...base,
  GOOGLE_CLIENT_ID: "id",
  GOOGLE_CLIENT_SECRET: "secret",
  DATABASE_URL: "postgresql://db",
  OPENROUTER_API_KEY: "sk-or",
  LEARNHOUSE_API_TOKEN: "lh_x",
  LEARNHOUSE_GROUP_UUIDS: "ug_1, ug_2",
  RESEND_API_KEY: "re_x",
  STRIPE_SECRET_KEY: "sk_test",
  STRIPE_WEBHOOK_SECRET: "whsec",
  STRIPE_PRICE_ID: "price",
  EXTENSION_IDS: "abcdefghijklmnopabcdefghijklmnop,ponmlkjihgfedcbaponmlkjihgfedcba",
  ADMIN_EMAILS: "a@b.c",
}

describe("parseEnv", () => {
  it("parses lists and defaults", () => {
    const env = parseEnv(full, true)
    expect(env.EXTENSION_IDS).toHaveLength(2)
    expect(env.LEARNHOUSE_GROUP_UUIDS).toEqual(["ug_1", "ug_2"])
    expect(env.JEV_MODEL).toBe("typesafe/jev-1.13")
    expect(env.LEARNHOUSE_ORG_SLUG).toBe("my-school")
    expect(env.PORT).toBe(8787)
    expect(env.MAIL_FROM).toBe("Cash Boost <contact@mail.example.com>")
  })

  it("requires every service in production, not in dev", () => {
    expect(() => parseEnv(base, true)).toThrow(/DATABASE_URL/)
    expect(parseEnv(base, false).DATABASE_URL).toBe("")
  })

  it("rejects a short secret or a malformed extension id", () => {
    expect(() => parseEnv({ BETTER_AUTH_SECRET: "short" }, false)).toThrow(/BETTER_AUTH_SECRET/)
    expect(() => parseEnv({ ...full, EXTENSION_IDS: "not-an-id" }, false)).toThrow(/EXTENSION_IDS/)
  })
})
