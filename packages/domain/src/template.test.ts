import { describe, expect, it } from "vitest"

import { firstName, pickVariant, pickVariantIndex, renderTemplate } from "./template"

describe("firstName", () => {
  it("takes the first word of the display name", () => {
    expect(firstName("Marie Dupont", "marie_dpt")).toBe("Marie")
  })

  it("ignores emojis and decorations around the name", () => {
    expect(firstName("🚀 Tom | Growth", "tomleroy")).toBe("Tom")
  })

  it("falls back to the handle when the name has no letters", () => {
    expect(firstName("🔥🔥", "karimh")).toBe("karimh")
  })
})

describe("renderTemplate", () => {
  it("fills {prénom} and {@handle}", () => {
    expect(renderTemplate("Salut {prénom}, regarde tes DMs {@handle}", { name: "Inès Morel", handle: "ines_mrl" })).toBe(
      "Salut Inès, regarde tes DMs @ines_mrl"
    )
  })

  it("accepts {prenom} without accent and repeated variables", () => {
    expect(renderTemplate("{prenom} {prénom}", { name: "Hugo", handle: "hugob" })).toBe("Hugo Hugo")
  })
})

describe("pickVariant", () => {
  it("uses the random source to choose", () => {
    expect(pickVariant(["a", "b", "c"], () => 0.99)).toBe("c")
    expect(pickVariant(["a", "b", "c"], () => 0)).toBe("a")
  })
})

describe("pickVariantIndex", () => {
  it("never repeats the variant used last time", () => {
    const variants = ["a", "b", "c"]
    expect(pickVariantIndex(variants, () => 0)).toBe(0)
    expect(pickVariantIndex(variants, () => 0, 0)).toBe(1)
    expect(pickVariantIndex(variants, () => 0.99, 2)).toBe(1)
    expect(pickVariantIndex(variants, () => 0.5, 1)).toBe(2)
    expect(pickVariantIndex(["only"], () => 0.5, 0)).toBe(0)
  })
})
