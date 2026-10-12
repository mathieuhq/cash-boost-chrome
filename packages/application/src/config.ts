// Engine settings, bundled with the extension: fixing an X change means publishing a new version.

/** Comments sent to the Classifier per call. */
export const MAX_CLASSIFY_BATCH = 25

/** Markers of the XChat UI (open shadow root under `root`), fixed here when X changes them. */
export interface XChatSelectors {
  root: string
  header: string
  composer: string
  send: string
  /** One row per message, whoever wrote it: the link is looked for in the last ones. */
  message: string
  /** A message row X confirmed as delivered. */
  sent: string
  /** Path XChat redirects to while it waits for the user's passcode. */
  lockedPath: string
}

export const DEFAULT_XCHAT_SELECTORS: XChatSelectors = {
  root: '[data-testid="xchatEmbedRoute"]',
  header: '[data-testid="dm-conversation-username"]',
  composer: '[data-testid="dm-composer-textarea"]',
  send: '[data-testid="dm-composer-send-button"]',
  message: '[data-testid^="message-"]:not([data-testid^="message-text-"])',
  sent: '[data-send-status="sent"]',
  lockedPath: "/i/chat/pin",
}

interface Limits {
  dm: number
  like: number
  reply: number
}

export interface Config {
  thresholds: { accept: number; review: number }
  limits: { free: Limits; premium: Limits }
  pacing: {
    actionDelaySeconds: [number, number]
    tickMinutes: [number, number]
  }
  x: {
    /** GraphQL operation name → queryId. Missing ones are discovered from x.com's bundle. */
    queryIds: Record<string, string>
    /** GraphQL `features` objects per operation; empty means the adapter's defaults. */
    features: Record<string, Record<string, boolean>>
    /**
     * `xchat_ui`: the XChat page in a dedicated tab, which also reads the last DMs to avoid sending twice.
     * `api`: legacy DM endpoint, blind. `public_reply`: fallback (a), the link goes in the public reply.
     */
    dmMode: "xchat_ui" | "api" | "public_reply"
    xchat: XChatSelectors
  }
}

export const DEFAULT_CONFIG: Config = {
  thresholds: { accept: 0.8, review: 0.4 },
  limits: { free: { dm: 20, like: 30, reply: 100 }, premium: { dm: 60, like: 30, reply: 100 } },
  pacing: { actionDelaySeconds: [30, 120], tickMinutes: [5, 15] },
  x: { queryIds: {}, features: {}, dmMode: "xchat_ui", xchat: DEFAULT_XCHAT_SELECTORS },
}
