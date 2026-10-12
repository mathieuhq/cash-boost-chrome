export const XCHAT_TAB_KEY = "xchatTabId"
const LOAD_TIMEOUT = 30_000

function waitForComplete(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener)
      reject(new Error("XChat tab did not load"))
    }, LOAD_TIMEOUT)
    const listener = (id: number, info: { status?: string }) => {
      if (id !== tabId || info.status !== "complete") return
      clearTimeout(timer)
      chrome.tabs.onUpdated.removeListener(listener)
      resolve()
    }
    chrome.tabs.onUpdated.addListener(listener)
  })
}

/**
 * A pinned background tab owned by the extension, where XChat conversations are opened one after the
 * other. The user's own x.com tab never navigates. Its id survives service worker restarts.
 */
export class XChatTab {
  private async existing(): Promise<number | null> {
    const stored = (await chrome.storage.session.get(XCHAT_TAB_KEY))[XCHAT_TAB_KEY]
    if (typeof stored !== "number") return null
    try {
      const tab = await chrome.tabs.get(stored)
      return tab.url?.startsWith("https://x.com/") ? stored : null
    } catch {
      return null
    }
  }

  async open(url: string): Promise<void> {
    const id = await this.existing()
    if (id !== null) {
      const loaded = waitForComplete(id)
      await chrome.tabs.update(id, { url, autoDiscardable: false })
      return loaded
    }
    const created = await chrome.tabs.create({ url, pinned: true, active: false })
    if (created.id === undefined) throw new Error("could not open XChat")
    await chrome.storage.session.set({ [XCHAT_TAB_KEY]: created.id })
    const loaded = waitForComplete(created.id)
    await chrome.tabs.update(created.id, { autoDiscardable: false })
    return loaded
  }

  async run<A extends unknown[], R>(func: (...args: A) => R | Promise<R>, args: A): Promise<Awaited<R>> {
    const id = await this.existing()
    if (id === null) throw new Error("XChat tab is not open")
    const [injection] = await chrome.scripting.executeScript({ target: { tabId: id }, world: "MAIN", func, args })
    if (!injection) throw new Error("XChat script did not run")
    return injection.result as Awaited<R>
  }
}
