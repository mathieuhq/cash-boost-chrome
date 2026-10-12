import { describe, expect, it } from "vitest"

import { UpstreamUnavailable } from "../application"
import { HttpLearnHouse } from "./learnhouse"

type Route = (url: URL, init: RequestInit | undefined) => Response | undefined

function setup(route: Route) {
  const requests: { url: string; authorization: string | null }[] = []
  const learnhouse = new HttpLearnHouse({
    baseUrl: "https://learn.test/",
    apiToken: "lh_secret",
    orgSlug: "my-school",
    groupUuids: ["ug_growth"],
    fetch: async (input, init) => {
      const url = new URL(String(input))
      requests.push({ url: url.pathname, authorization: new Headers(init?.headers).get("authorization") })
      const response = route(url, init)
      if (!response) throw new TypeError("network")
      return response
    },
  })
  return { learnhouse, requests }
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

describe("HttpLearnHouse.isMember", () => {
  const groups = (uuids: string[]) => uuids.map((uuid) => ({ usergroup: { usergroup_uuid: uuid, name: "g" }, added_at: "" }))

  it("looks the user up by email, then checks its groups with the lh_ token", async () => {
    const { learnhouse, requests } = setup((url) =>
      url.pathname.includes("/by-email/") ? json({ id: 7, email: "a+b@c.fr" }) : json(groups(["other", "ug_growth"]))
    )
    expect(await learnhouse.isMember("a+b@c.fr")).toBe(true)
    expect(requests).toEqual([
      { url: "/api/v1/admin/my-school/users/by-email/a%2Bb%40c.fr", authorization: "Bearer lh_secret" },
      { url: "/api/v1/admin/my-school/users/7/groups", authorization: "Bearer lh_secret" },
    ])
  })

  it("is false outside the groups or the org", async () => {
    expect(await setup((url) => (url.pathname.includes("/by-email/") ? json({ id: 7 }) : json(groups(["other"])))).learnhouse.isMember("a@b.c")).toBe(false)
    expect(await setup(() => json({ detail: "User not found in this organization" }, 404)).learnhouse.isMember("a@b.c")).toBe(false)
  })

  it("throws UpstreamUnavailable on 429, 5xx or network errors", async () => {
    await expect(setup(() => json({}, 429)).learnhouse.isMember("a@b.c")).rejects.toBeInstanceOf(UpstreamUnavailable)
    await expect(setup(() => json({}, 502)).learnhouse.isMember("a@b.c")).rejects.toBeInstanceOf(UpstreamUnavailable)
    await expect(setup(() => undefined).learnhouse.isMember("a@b.c")).rejects.toBeInstanceOf(UpstreamUnavailable)
  })
})
