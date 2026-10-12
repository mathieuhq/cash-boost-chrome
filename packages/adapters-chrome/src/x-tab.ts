import { XCHAT_TAB_KEY } from "./xchat-tab"

const X_URL = "https://x.com/*"
const LOAD_TIMEOUT = 30_000

function waitForComplete(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener)
      reject(new Error("x.com tab did not load"))
    }, LOAD_TIMEOUT)
    const listener = (id: number, info: { status?: string }) => {
      if (id !== tabId || info.status !== "complete") return
      clearTimeout(timer)
      chrome.tabs.onUpdated.removeListener(listener)
      resolve()
    }
    chrome.tabs.onUpdated.addListener(listener)
    chrome.tabs.get(tabId).then((tab) => tab.status === "complete" && listener(tabId, { status: "complete" }), reject)
  })
}

/**
 * Runs functions in the MAIN world of an x.com tab (ADR 0004): requests carry the page's cookies,
 * Origin and fingerprint. Without an open x.com tab, a pinned one is opened in the background.
 */
export class XTab {
  private opening: Promise<number> | null = null

  async tabId(): Promise<number> {
    // The XChat tab keeps navigating from one conversation to the next: never run requests there.
    const xchat = (await chrome.storage.session.get(XCHAT_TAB_KEY))[XCHAT_TAB_KEY]
    const tabs = (await chrome.tabs.query({ url: X_URL })).filter((t) => t.id !== xchat)
    const tab = tabs.find((t) => t.status === "complete" && !t.discarded) ?? tabs.find((t) => !t.discarded) ?? tabs[0]
    if (tab?.id !== undefined) {
      if (tab.discarded) await chrome.tabs.reload(tab.id)
      if (tab.status !== "complete" || tab.discarded) await waitForComplete(tab.id)
      return tab.id
    }
    this.opening ??= (async () => {
      const created = await chrome.tabs.create({ url: "https://x.com/home", pinned: true, active: false })
      if (created.id === undefined) throw new Error("could not open x.com")
      await waitForComplete(created.id)
      return created.id
    })().finally(() => {
      this.opening = null
    })
    return this.opening
  }

  async reload(): Promise<void> {
    const tabId = await this.tabId()
    await chrome.tabs.reload(tabId)
    await waitForComplete(tabId)
  }

  async run<A extends unknown[], R>(func: (...args: A) => R | Promise<R>, args: A): Promise<Awaited<R>> {
    const tabId = await this.tabId()
    const [injection] = await chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", func, args })
    if (!injection) throw new Error("x.com script did not run")
    return injection.result as Awaited<R>
  }
}
