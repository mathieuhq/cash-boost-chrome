import { DAY } from "./time"

/** SPEC "Licence": at most 3 ActiveBrowser changes per rolling week. */
export const MAX_BROWSER_CHANGES = 3
export const BROWSER_CHANGE_WINDOW = 7 * DAY

export interface BrowserState {
  activeBrowserId: string | null
  /** Epoch ms of each change within the window. */
  browserChanges: number[]
}

export type BrowserSwitch = { ok: true; changed: boolean; state: BrowserState } | { ok: false }

/** Last login wins. The first registration is free; a 4th change within 7 days is refused. */
export function switchBrowser(state: BrowserState, browserId: string, now: number): BrowserSwitch {
  if (state.activeBrowserId === browserId) return { ok: true, changed: false, state }
  const recent = state.browserChanges.filter((at) => now - at < BROWSER_CHANGE_WINDOW)
  if (state.activeBrowserId === null) {
    return { ok: true, changed: true, state: { activeBrowserId: browserId, browserChanges: recent } }
  }
  if (recent.length >= MAX_BROWSER_CHANGES) return { ok: false }
  return { ok: true, changed: true, state: { activeBrowserId: browserId, browserChanges: [...recent, now] } }
}
