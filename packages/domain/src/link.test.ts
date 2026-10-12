import { describe, expect, it } from "vitest"

import { campaignLinks, containsLink, normalizeLink } from "./link"

describe("normalizeLink", () => {
  it("drops the scheme, www., tracking parameters and the trailing slash", () => {
    expect(normalizeLink("https://www.Pim.ms/0qtKj00/?utm_source=x&s=20")).toBe("pim.ms/0qtKj00")
    expect(normalizeLink("pim.ms/0qtKj00")).toBe("pim.ms/0qtKj00")
  })

  it("keeps the parameters that identify the page", () => {
    expect(normalizeLink("https://notion.so/guide?v=2")).toBe("notion.so/guide?v=2")
  })

  it("rejects what is not a link", () => {
    expect(normalizeLink("  ")).toBeNull()
  })
})

describe("containsLink", () => {
  const links = campaignLinks({ leadMagnetUrl: "https://pim.ms/0qtKj00", formerLinks: ["https://old.example.com/guide"] })

  it("finds the lead magnet in a DM, with or without scheme", () => {
    expect(containsLink("hello, voilà le guide : pim.ms/0qtKj00", links)).toBe(true)
    expect(containsLink("tiens https://pim.ms/0qtKj00.", links)).toBe(true)
  })

  it("counts an earlier link to the same lead magnet", () => {
    expect(containsLink("le guide : old.example.com/guide", links)).toBe(true)
  })

  it("ignores another lead magnet", () => {
    expect(containsLink("autre chose : pim.ms/AUTRE", links)).toBe(false)
  })
})
