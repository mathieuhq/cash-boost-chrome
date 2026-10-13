// Engine settings, bundled with the extension: fixing an X change means publishing a new version.
import type { ActiveHours, RampUp, Range } from "@super-x/domain"

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
  /** The rhythm of a person on X (ADR 0011): delays skewed short, bursts and breaks, nights off. */
  pacing: {
    /** Between two Leads, in seconds. */
    actionDelaySeconds: Range
    /** Between two Actions on the same Lead (like, then reply): the person is still on that comment. */
    followUpDelaySeconds: Range
    /** Before the first Action on Comments a scan just found: time to notice them. */
    reactionSeconds: Range
    /** Between two scans while the post gets new Comments. */
    tickMinutes: Range
    /** Between two scans once `quietTicks` scans in a row found nothing new. */
    quietTickMinutes: Range
    quietTicks: number
    /** Actions done in one sitting before a break. */
    burstActions: Range
    breakMinutes: Range
    /** Browser local time; nothing is scanned or sent outside. */
    activeHours: ActiveHours
  }
  /** How much the account does (ADR 0011): gentle first days, a daily target that moves, not every comment answered. */
  volume: {
    rampUp: RampUp
    /** Share of the daily limits (DMs, replies) aimed at today, drawn once a day. */
    dailyTarget: Range
    /** Share of the delivered Leads that get the public "sent" reply. */
    replyRate: number
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
  limits: { free: { dm: 50, like: 30, reply: 100 }, premium: { dm: 150, like: 30, reply: 100 } },
  pacing: {
    actionDelaySeconds: [8, 60],
    followUpDelaySeconds: [3, 10],
    reactionSeconds: [10, 60],
    tickMinutes: [2, 5],
    quietTickMinutes: [6, 12],
    quietTicks: 3,
    burstActions: [10, 20],
    breakMinutes: [3, 12],
    activeHours: { start: 8, end: 21, jitterMinutes: 45 },
  },
  volume: { rampUp: { days: 7, startFraction: 0.4 }, dailyTarget: [0.7, 1], replyRate: 0.7 },
  x: { queryIds: {}, features: {}, dmMode: "xchat_ui", xchat: DEFAULT_XCHAT_SELECTORS },
}
