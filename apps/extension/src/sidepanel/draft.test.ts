import { describe, expect, it } from "vitest"

import { defaultCampaignDefaults, emptyDraft, parseTweetUrl, readDefaults, toVariants, validateDraft } from "./draft"
import type { CampaignDraft } from "./model"

function validDraft(patch: Partial<CampaignDraft> = {}): CampaignDraft {
  return {
    ...emptyDraft(),
    tweetUrl: "https://x.com/jane/status/1845",
    keyword: "GUIDE",
    leadMagnetUrl: "https://notion.so/template",
    ...patch,
  }
}

describe("parseTweetUrl", () => {
  it("reads handle and id from x.com and twitter.com status URLs", () => {
    expect(parseTweetUrl("https://x.com/jane/status/1845")).toEqual({ handle: "jane", tweetId: "1845" })
    expect(parseTweetUrl("https://twitter.com/a_b/status/42?s=20")).toEqual({ handle: "a_b", tweetId: "42" })
    expect(parseTweetUrl("  https://mobile.x.com/me/status/7/photo/1  ")).toEqual({ handle: "me", tweetId: "7" })
  })

  it("rejects anything that is not a single status URL", () => {
    expect(parseTweetUrl("https://x.com/jane")).toBeNull()
    expect(parseTweetUrl("https://example.com/jane/status/1")).toBeNull()
    expect(parseTweetUrl("https://x.com/a/status/1https://x.com/a/status/1")).toBeNull()
  })
})

describe("validateDraft", () => {
  it("accepts a complete draft with the default templates", () => {
    expect(validateDraft(validDraft())).toEqual({})
  })

  it("flags each missing field", () => {
    const errors = validateDraft(emptyDraft())
    expect(Object.keys(errors).sort()).toEqual(["keyword", "leadMagnetUrl", "tweetUrl"])
  })

  it("requires 3 to 5 variants in every template family", () => {
    const tooFew = validDraft({ templates: { ...emptyDraft().templates, ackSent: ["a", "b"] } })
    const tooMany = validDraft({ templates: { ...emptyDraft().templates, dm: ["1", "2", "3", "4", "5", "6"] } })
    expect(validateDraft(tooFew).templates).toBeDefined()
    expect(validateDraft(tooMany).templates).toBeDefined()
  })

  it("rejects a lead magnet that is not an http(s) URL", () => {
    expect(validateDraft(validDraft({ leadMagnetUrl: "javascript:alert(1)" })).leadMagnetUrl).toBeDefined()
  })
})

describe("readDefaults", () => {
  it("completes what was saved in Options with the built-in defaults", () => {
    expect(readDefaults(undefined)).toEqual(defaultCampaignDefaults())
    expect(readDefaults({ durationHours: 72 })).toEqual({ ...defaultCampaignDefaults(), durationHours: 72 })
  })
})

describe("toVariants", () => {
  it("keeps one trimmed variant per non-empty line", () => {
    expect(toVariants(" a \n\n b\n")).toEqual(["a", "b"])
  })
})
