import type { AccountTier, Random, XUser } from "@super-x/domain"

import type { Config } from "./config"
import type { EngineState } from "./state"

/** The X account the browser is logged into. */
export interface XAccount extends XUser {
  tier: AccountTier
}

export interface Tweet {
  id: string
  authorId: string
  text: string
}

/** A reply to the SourceTweet, with its author. Only direct replies become Comments. */
export interface Reply {
  id: string
  text: string
  inReplyToId: string
  author: XUser
}

export interface Relationship {
  followsMe: boolean
  canDm: boolean
}

export type XErrorKind =
  /** 429 / codes 88, 226, 326, 344, 185: X is limiting the account → CircuitBreaker. */
  | "restriction"
  /** Logged out of x.com → CircuitBreaker until the session comes back. */
  | "session_expired"
  /** Tweet or user gone. */
  | "not_found"
  /** The recipient can't receive our DM. */
  | "dm_closed"
  /** XChat waits for the user's passcode → CircuitBreaker until they unlock it and restart. */
  | "xchat_locked"
  /** A marker of the XChat UI is gone (X changed its page) → CircuitBreaker until the config is fixed. */
  | "xchat_unavailable"
  /** Network or unknown failure, retried later. */
  | "transient"

export class XError extends Error {
  constructor(
    readonly kind: XErrorKind,
    /** Short code without any content (e.g. "http_429", "x_226"). */
    readonly code: string,
    message?: string
  ) {
    super(message ?? `${kind} (${code})`)
    this.name = "XError"
  }
}

/** Calls to X's internal endpoints, executed from an x.com tab (ADR 0004). */
export interface XGateway {
  whoami(): Promise<XAccount>
  getTweet(id: string): Promise<Tweet>
  /**
   * Replies to a tweet, newest first. Pagination may stop once only `known` comment ids come back.
   * May include nested replies: callers filter on `inReplyToId`.
   */
  listReplies(tweetId: string, known?: ReadonlySet<string>): Promise<Reply[]>
  like(tweetId: string): Promise<void>
  reply(toTweetId: string, text: string): Promise<void>
  relationship(userId: string): Promise<Relationship>
  /**
   * Sends `text` unless one of the normalized `links` is already in the last DMs (`already_sent`).
   * Throws XError("dm_closed") when X refuses the conversation.
   */
  sendDm(userId: string, text: string, links: readonly string[]): Promise<"sent" | "already_sent">
}

export class ClassifierUnavailable extends Error {
  constructor(readonly reason: "no_key" | "unauthorized" | "unavailable") {
    super(`classifier ${reason}`)
    this.name = "ClassifierUnavailable"
  }
}

/** Jev, called with the user's OpenRouter key (ADR 0006). */
export interface Classifier {
  classify(keyword: string, comments: { id: string; text: string }[]): Promise<{ id: string; probability: number }[]>
}

export interface ConfigSource {
  get(): Promise<Config>
}

export interface StateStore {
  /** The X account whose state was saved last, if any. */
  currentAccountId(): Promise<string | null>
  /** The state of an X account (empty if never seen). */
  load(accountId: string): Promise<EngineState>
  save(state: EngineState): Promise<void>
}

export interface Scheduler {
  scheduleTick(at: number): Promise<void>
  scheduleAction(at: number): Promise<void>
}

export interface Clock {
  now(): number
}

export interface EngineDeps {
  x: XGateway
  classifier: Classifier
  config: ConfigSource
  store: StateStore
  scheduler: Scheduler
  clock: Clock
  random: Random
  ids: () => string
}
