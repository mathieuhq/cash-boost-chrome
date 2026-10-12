import { describe, expect, it } from "vitest"

import { BROWSER_CHANGE_WINDOW, switchBrowser, type BrowserState } from "./browser"

const now = 1_800_000_000_000

describe("switchBrowser", () => {
  it("registers the first browser without counting a change", () => {
    expect(switchBrowser({ activeBrowserId: null, browserChanges: [] }, "a", now)).toEqual({
      ok: true,
      changed: true,
      state: { activeBrowserId: "a", browserChanges: [] },
    })
  })

  it("keeps the same browser untouched", () => {
    const state = { activeBrowserId: "a", browserChanges: [now - 1] }
    expect(switchBrowser(state, "a", now)).toEqual({ ok: true, changed: false, state })
  })

  it("counts each change and refuses a 4th within 7 days", () => {
    let state: BrowserState = { activeBrowserId: "a", browserChanges: [] }
    for (const id of ["b", "c", "d"]) {
      const result = switchBrowser(state, id, now)
      if (!result.ok) throw new Error("refused")
      state = result.state
    }
    expect(state.browserChanges).toHaveLength(3)
    expect(switchBrowser(state, "e", now)).toEqual({ ok: false })
  })

  it("forgets changes older than the window", () => {
    const state = { activeBrowserId: "a", browserChanges: [now - BROWSER_CHANGE_WINDOW, now - BROWSER_CHANGE_WINDOW - 5, now - 10] }
    expect(switchBrowser(state, "b", now)).toEqual({
      ok: true,
      changed: true,
      state: { activeBrowserId: "b", browserChanges: [now - 10, now] },
    })
  })
})
