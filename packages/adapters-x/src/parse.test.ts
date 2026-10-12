import { describe, expect, it } from "vitest"

import detail from "./__fixtures__/tweet-detail.json"
import { missingFeatures, parseTweetDetail } from "./parse"

const FOCAL = "1900000000000000001"

describe("parseTweetDetail (contract: 2026-08 response shape)", () => {
  const page = parseTweetDetail(detail, FOCAL)

  it("finds the focal tweet and its author", () => {
    expect(page.focal).toMatchObject({ id: FOCAL, author: { id: "111", handle: "me", premium: true } })
  })

  it("reads replies with the current user shape (core, relationship_perspectives, dm_permissions)", () => {
    expect(page.tweets.find((t) => t.id === "1900000000000000050")).toEqual({
      id: "1900000000000000050",
      text: "@me GUIDE",
      inReplyToId: FOCAL,
      author: {
        id: "222",
        handle: "jane",
        name: "Jane",
        premium: false,
        avatar: "https://pbs.twimg.com/profile_images/222/jane_normal.jpg",
        followsMe: true,
        canDm: true,
      },
    })
  })

  it("unwraps visibility results, prefers note tweets and falls back to the legacy user shape", () => {
    expect(page.tweets.find((t) => t.id === "1900000000000000070")).toMatchObject({
      text: "Long reply asking for the guide please",
      author: { id: "333", handle: "old_shape", avatar: "https://pbs.twimg.com/profile_images/333/old_normal.jpg", followsMe: false, canDm: false },
    })
  })

  it("keeps nested replies (filtered later on inReplyToId) and skips tombstones", () => {
    expect(page.tweets.map((t) => t.id)).toEqual([FOCAL, "1900000000000000050", "1900000000000000060", "1900000000000000070"])
  })

  it("collects pagination cursors but not nested 'show more' ones", () => {
    expect(page.cursors).toEqual(["DAAKCgABHPEX"])
  })
})

describe("missingFeatures", () => {
  it("reads the names from a code 336 error", () => {
    expect(missingFeatures({ errors: [{ code: 336, message: "The following features cannot be null: a_b, c_d" }] })).toEqual([
      "a_b",
      "c_d",
    ])
  })
})
