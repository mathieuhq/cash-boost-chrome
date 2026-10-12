import { describe, expect, it } from "vitest"

import { matchesKeyword, normalizeText } from "./keyword"

describe("normalizeText", () => {
  it("lowercases, strips accents, emojis and punctuation", () => {
    expect(normalizeText("  Génial !! 🙏 Le GUIDE, stp…  ")).toBe("genial le guide stp")
  })

  it("drops @mentions and links", () => {
    expect(normalizeText("@me GUIDE https://t.co/abc")).toBe("guide")
  })
})

describe("matchesKeyword", () => {
  it.each([
    ["GUIDE", "guide"],
    ["guide svp !", "GUIDE"],
    ["Guide 🙏", "guide"],
    ["je veux le guide, merci", "Guide"],
    ["@me Checklist", "checklist"],
    ["Prompt pack", "prompt pack"],
    ["ÉTÉ", "ete"],
  ])("%s contains %s", (comment, keyword) => {
    expect(matchesKeyword(comment, keyword)).toBe(true)
  })

  it.each([
    ["guides", "guide"],
    ["c'est quoi ton truc ?", "guide"],
    ["", "guide"],
    ["guide", "   "],
  ])("%s does not contain %s", (comment, keyword) => {
    expect(matchesKeyword(comment, keyword)).toBe(false)
  })
})
