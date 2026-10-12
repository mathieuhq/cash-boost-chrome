// Drives the XChat page (x.com/i/chat/<conversation>) in a dedicated tab. XChat decrypts the
// messages for display, so reading the page is the only way to see what was already sent.
// The UI lives in an open shadow root; its markers come from the Config (`x.xchat`).
import type { XChatSelectors } from "@super-x/application"

/** How many of the last messages are searched for the link. */
export const XCHAT_HISTORY = 10

/** A tab that can be sent to a URL, then run functions in its MAIN world (XChatTab in adapters-chrome). */
export interface ChatPage {
  open(url: string): Promise<void>
  run<A extends unknown[], R>(func: (...args: A) => R | Promise<R>, args: A): Promise<Awaited<R>>
}

export type ConversationState =
  | { state: "ready"; messages: string[] }
  | { state: "locked" }
  | { state: "closed" }
  | { state: "missing"; marker: "root" | "composer" }

/**
 * Waits for the conversation to settle, then returns the text and links of its last messages.
 * Serialized into the page: must not reference anything outside itself.
 */
export async function readConversation(s: XChatSelectors, history: number, timeoutMs: number): Promise<ConversationState> {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
  const deadline = Date.now() + timeoutMs
  let lastCount = -1
  let stableSince = 0
  while (Date.now() < deadline) {
    if (location.pathname.startsWith(s.lockedPath)) return { state: "locked" }
    const root = document.querySelector(s.root)?.shadowRoot
    if (root?.querySelector(s.composer)) {
      const rows = Array.from(root.querySelectorAll(s.message))
      // Messages arrive after the composer, once decrypted: wait until their count stops moving.
      // An empty conversation must hold much longer: in the background tab Chrome fires timers about
      // once a second, so two polls can both land before decryption and send the link a second time.
      if (rows.length !== lastCount) {
        lastCount = rows.length
        stableSince = Date.now()
      } else if (Date.now() - stableSince >= (rows.length ? 1_000 : 6_000)) {
        const messages = rows.slice(-history).map((row) => {
          const hrefs = Array.from(row.querySelectorAll("a[href]")).map((a) => (a as HTMLAnchorElement).href)
          return [(row as HTMLElement).innerText, ...hrefs].join("\n")
        })
        return { state: "ready", messages }
      }
    }
    await sleep(250)
  }
  const root = document.querySelector(s.root)?.shadowRoot
  if (!root) return { state: "missing", marker: "root" }
  // The conversation loaded but offers no composer: X does not let us write to this person. [unsure]
  if (root.querySelector(s.header)) return { state: "closed" }
  return { state: "missing", marker: "composer" }
}

export type SendState = { state: "sent" } | { state: "no_send_button" } | { state: "unconfirmed" }

/** How the message is typed, in milliseconds: like a person who reads first, types word by word, then checks. */
export interface TypingPace {
  /** Looking at the conversation before typing. */
  readMs: [number, number]
  /**
   * Per word. Chrome fires the timers of a background tab about once a second, so in the dedicated tab
   * each word in fact takes at least that long: a 40-word DM takes about a minute.
   */
  wordMs: [number, number]
  /** Rereading before Send. */
  beforeSendMs: [number, number]
}

export const DEFAULT_TYPING_PACE: TypingPace = { readMs: [1_500, 4_000], wordMs: [120, 380], beforeSendMs: [600, 1_800] }

/**
 * Types `text` in the composer word by word, clicks Send, and waits until X marks the new message as
 * delivered. Serialized into the page: must not reference anything outside itself.
 */
export async function sendMessage(s: XChatSelectors, text: string, timeoutMs: number, pace: TypingPace): Promise<SendState> {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
  const jitter = ([min, max]: [number, number]) => min + Math.random() * (max - min)
  const root = document.querySelector(s.root)?.shadowRoot
  const composer = root?.querySelector(s.composer) as HTMLTextAreaElement | null | undefined
  if (!root || !composer) return { state: "no_send_button" }
  const before = new Set(Array.from(root.querySelectorAll(s.message)))

  await sleep(jitter(pace.readMs))
  composer.focus()
  // React tracks the value through the native setter: assigning `value` alone is ignored.
  const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!
  const type = (value: string) => {
    setValue.call(composer, value)
    composer.dispatchEvent(new Event("input", { bubbles: true }))
  }
  let typed = ""
  for (const word of text.match(/\S+\s*|\s+/g) ?? [text]) {
    typed += word
    type(typed)
    await sleep(jitter(pace.wordMs))
  }
  if (composer.value !== text) type(text)

  let button: HTMLButtonElement | null = null
  for (let i = 0; i < 20 && !button; i++) {
    await sleep(100)
    button = root.querySelector(s.send) as HTMLButtonElement | null
  }
  if (!button || button.disabled) return { state: "no_send_button" }
  await sleep(jitter(pace.beforeSendMs))
  button.click()

  const deadline = Date.now() + timeoutMs
  const head = text.slice(0, 40)
  while (Date.now() < deadline) {
    await sleep(250)
    const fresh = Array.from(root.querySelectorAll(s.message)).filter((row) => !before.has(row))
    if (fresh.some((row) => row.matches(s.sent) && (row as HTMLElement).innerText.includes(head))) return { state: "sent" }
  }
  return { state: "unconfirmed" }
}
