// In-memory fakes of the ports (ADR 0003), shared by the application tests and the extension's tests.
import { DEFAULT_CONFIG, type Config } from "../config"
import {
  ClassifierUnavailable,
  XError,
  type Classifier,
  type ConfigSource,
  type EngineDeps,
  type Relationship,
  type Reply,
  type Scheduler,
  type StateStore,
  type Tweet,
  type XAccount,
  type XGateway,
} from "../ports"
import { emptyState, type EngineState } from "../state"

export const ME: XAccount = { id: "100", handle: "me", name: "Moi", tier: "free" }

/** With `random = () => 0` the first variant of each family is always used. */
export const TEST_TEMPLATES = {
  dm: ["Salut {prénom} !", "Hello {prénom}", "Voici {prénom}"],
  ackSent: ["C'est envoyé en DM {@handle}", "Regarde tes DMs {@handle}", "Envoyé {@handle}"],
  ackDmClosed: ["Ouvre tes DMs {@handle}", "Suis-moi {@handle}", "DMs fermés {@handle}"],
}

export class FakeX implements XGateway {
  account: XAccount | null = ME
  tweets = new Map<string, Tweet>()
  replies = new Map<string, Reply[]>()
  relationships = new Map<string, Relationship>()
  /** Normalized links already in the DMs with each user. */
  inbox = new Map<string, string[]>()
  /** Users whose DMs refuse us (XChat says so when the conversation opens). */
  closedDms = new Set<string>()
  calls: string[] = []
  /** Next error thrown by any write call (like, reply, dm). */
  failNext: XError | null = null
  failListing: XError | null = null

  async whoami() {
    if (!this.account) throw new XError("session_expired", "logged_out")
    return this.account
  }
  async getTweet(id: string) {
    const tweet = this.tweets.get(id)
    if (!tweet) throw new XError("not_found", "tweet_not_found")
    return tweet
  }
  async listReplies(tweetId: string) {
    if (this.failListing) throw this.failListing
    return this.replies.get(tweetId) ?? []
  }
  private write(call: string) {
    if (this.failNext) {
      const error = this.failNext
      this.failNext = null
      throw error
    }
    this.calls.push(call)
  }
  async like(tweetId: string) {
    this.write(`like ${tweetId}`)
  }
  async reply(toTweetId: string, text: string) {
    this.write(`reply ${toTweetId} ${text}`)
  }
  async relationship(userId: string) {
    return this.relationships.get(userId) ?? { followsMe: false, canDm: true }
  }
  async sendDm(userId: string, text: string, links: readonly string[]) {
    if (links.some((l) => this.inbox.get(userId)?.includes(l))) return "already_sent" as const
    if (this.closedDms.has(userId)) throw new XError("dm_closed", "xchat_closed")
    this.write(`dm ${userId} ${text}`)
    return "sent" as const
  }

  addTweet(tweet: Tweet) {
    this.tweets.set(tweet.id, tweet)
  }
  addReply(tweetId: string, reply: Omit<Reply, "inReplyToId"> & { inReplyToId?: string }) {
    const list = this.replies.get(tweetId) ?? []
    list.push({ inReplyToId: tweetId, ...reply })
    this.replies.set(tweetId, list)
  }
}

export class FakeClassifier implements Classifier {
  probabilities = new Map<string, number>()
  unavailable: ClassifierUnavailable | null = null
  batches: string[][] = []
  async classify(_keyword: string, comments: { id: string; text: string }[]) {
    if (this.unavailable) throw this.unavailable
    this.batches.push(comments.map((c) => c.id))
    return comments.map((c) => ({ id: c.id, probability: this.probabilities.get(c.text) ?? 0 }))
  }
}

export class FakeConfig implements ConfigSource {
  config: Config = structuredClone(DEFAULT_CONFIG)
  async get() {
    return this.config
  }
}

export class InMemoryStore implements StateStore {
  states = new Map<string, EngineState>()
  current: string | null = null
  async currentAccountId() {
    return this.current
  }
  async load(accountId: string) {
    const state = this.states.get(accountId)
    return state ? structuredClone(state) : emptyState({ ...ME, id: accountId })
  }
  async save(state: EngineState) {
    this.states.set(state.account.id, structuredClone(state))
    this.current = state.account.id
  }
  get state(): EngineState {
    const state = this.current ? this.states.get(this.current) : undefined
    if (!state) throw new Error("no state saved")
    return state
  }
}

export class FakeScheduler implements Scheduler {
  ticks: number[] = []
  actions: number[] = []
  async scheduleTick(at: number) {
    this.ticks.push(at)
  }
  async scheduleAction(at: number) {
    this.actions.push(at)
  }
}

export class FakeClock {
  constructor(public time = Date.UTC(2026, 9, 11, 12)) {}
  now = () => this.time
  advance(ms: number) {
    this.time += ms
  }
}

export function fakeDeps() {
  let n = 0
  const deps = {
    x: new FakeX(),
    classifier: new FakeClassifier(),
    config: new FakeConfig(),
    store: new InMemoryStore(),
    scheduler: new FakeScheduler(),
    clock: new FakeClock(),
    random: () => 0,
    ids: () => `id${++n}`,
  }
  return deps satisfies EngineDeps
}
