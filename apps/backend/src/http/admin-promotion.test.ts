import { MeResponse } from "@super-x/contracts"
import { afterAll, beforeAll, expect, it } from "vitest"

import { account, user } from "../adapters/db/schema"
import { ADMIN_EMAIL, createTestBackend, type TestBackend } from "./test-harness"

let t: TestBackend

beforeAll(async () => {
  t = await createTestBackend()
})
afterAll(() => t.close())

it("promotes an existing user added to ADMIN_EMAILS on their next sign-in", async () => {
  await t.db.insert(user).values({ id: "old", name: "Old", email: ADMIN_EMAIL, emailVerified: true, role: "user" })
  await t.db.insert(account).values({
    id: "acc-old",
    accountId: `google-${ADMIN_EMAIL}`,
    providerId: "google",
    userId: "old",
    updatedAt: new Date(),
  })
  const client = await t.signIn(ADMIN_EMAIL)
  const me = MeResponse.parse(await (await client.call("/api/me")).json())
  expect(me.account).toMatchObject({ id: "old", role: "admin" })
})
