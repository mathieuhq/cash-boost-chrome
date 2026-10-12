import { XError, type Config, type ConfigSource, type Relationship, type Reply, type Tweet, type XAccount, type XGateway } from "@super-x/application"
import { containsLink } from "@super-x/domain"

import { DEFAULT_FEATURES, DEFAULT_FIELD_TOGGLES, DEFAULT_QUERY_IDS, type OperationName } from "./defaults"
import { toXError, type XResponse } from "./errors"
import { BRIDGE_KEY, type Bridge, type Discovery, type PageRequest } from "./page/bridge"
import { missingFeatures, parseTweetDetail, parseUser, type ParsedTweet } from "./parse"
import { DEFAULT_TYPING_PACE, readConversation, sendMessage, XCHAT_HISTORY, type ChatPage } from "./xchat"

/** Executes a self-contained function in the x.com tab (XTab in adapters-chrome). */
export interface PageRunner {
  run<A extends unknown[], R>(func: (...args: A) => R | Promise<R>, args: A): Promise<Awaited<R>>
  /** Reloads the x.com tab, e.g. when the bridge content script is not there yet. */
  reload(): Promise<void>
}

type BridgeMethod = "viewerId" | "request" | "discover"

type Invocation = { missing: true } | { missing: false; value: unknown }

/** Serialized into the page by chrome.scripting: must not reference anything outside itself. */
function invoke(key: string, method: string, args: unknown[]): Promise<Invocation> {
  const bridge = (window as unknown as Record<string, Record<string, (...a: unknown[]) => unknown> | undefined>)[key]
  if (!bridge) return Promise.resolve({ missing: true })
  return Promise.resolve(bridge[method]!.apply(bridge, args)).then((value) => ({ missing: false, value }))
}

const MAX_REPLY_PAGES = 10
/** Between two pages of replies, in ms: the time it takes a person to scroll down. */
const SCROLL_PAUSE: [number, number] = [700, 2_200]
const XCHAT_LOAD_TIMEOUT = 20_000
const XCHAT_SEND_TIMEOUT = 15_000

const defaultWait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export class XWebGateway implements XGateway {
  private discovery: Promise<Discovery | null> | null = null
  /** Learned from the last scans: who follows us, who accepts DMs. */
  private readonly authors = new Map<string, { followsMe?: boolean; canDm?: boolean }>()
  private me: string | null = null

  constructor(
    private readonly page: PageRunner,
    private readonly config: ConfigSource,
    /** Dedicated tab for XChat, so the user's own x.com tab never navigates. */
    private readonly chat?: ChatPage,
    /** Pauses between two pages of a scan; instant in tests. */
    private readonly wait: (ms: number) => Promise<void> = defaultWait
  ) {}

  private async bridge<T>(method: BridgeMethod, ...args: unknown[]): Promise<T> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await this.page.run(invoke, [BRIDGE_KEY, method, args])
      if (!result.missing) return result.value as T
      await this.page.reload()
    }
    throw new XError("transient", "bridge_missing")
  }

  private async raw(request: PageRequest): Promise<XResponse> {
    const response = await this.bridge<XResponse>("request", request)
    if (response.status === 0) throw new XError("transient", "network")
    return response
  }

  private async operation(name: OperationName) {
    const remote = (await this.config.get()).x
    this.discovery ??= this.bridge<Discovery | null>("discover").catch(() => null)
    const discovered = (await this.discovery)?.operations[name]
    const features = { ...DEFAULT_FEATURES[name], ...discovered?.features, ...remote.features[name] }
    const toggles = { ...Object.fromEntries((discovered?.fieldToggles ?? []).map((t) => [t, false])), ...DEFAULT_FIELD_TOGGLES[name] }
    return {
      queryId: remote.queryIds[name] ?? discovered?.queryId ?? DEFAULT_QUERY_IDS[name],
      features,
      fieldToggles: toggles,
    }
  }

  /** GraphQL call with one self-healing retry on missing features (336) or a stale queryId (404). */
  private async graphql(name: OperationName, variables: Record<string, unknown>): Promise<unknown> {
    const mutation = name === "FavoriteTweet" || name === "CreateTweet"
    let op = await this.operation(name)
    for (let attempt = 0; ; attempt++) {
      const path = `/i/api/graphql/${op.queryId}/${name}`
      const response = await this.raw(
        mutation
          ? {
              method: "POST",
              path,
              body: { variables, ...(Object.keys(op.features).length ? { features: op.features } : {}), queryId: op.queryId },
            }
          : {
              method: "GET",
              path,
              query: {
                variables: JSON.stringify(variables),
                features: JSON.stringify(op.features),
                ...(Object.keys(op.fieldToggles).length ? { fieldToggles: JSON.stringify(op.fieldToggles) } : {}),
              },
            }
      )
      const missing = missingFeatures(response.json)
      if (attempt === 0 && missing.length) {
        op = { ...op, features: { ...op.features, ...Object.fromEntries(missing.map((f) => [f, false])) } }
        continue
      }
      if (attempt === 0 && response.status === 404) {
        this.discovery = null
        op = await this.operation(name)
        continue
      }
      // On GraphQL a 404 means a stale queryId or transaction id, not a missing tweet.
      if (response.status === 404) throw new XError("transient", `gql_404_${name}`)
      const error = toXError(response)
      if (error) throw error
      return response.json
    }
  }

  async whoami(): Promise<XAccount> {
    const id = await this.bridge<string | null>("viewerId")
    if (!id) throw new XError("session_expired", "logged_out")
    this.me = id
    const json = await this.graphql("Viewer", { withCommunitiesMemberships: true })
    const user = parseUser((json as { data?: { viewer?: { user_results?: { result?: unknown } } } }).data?.viewer?.user_results?.result)
    if (!user) throw new XError("transient", "viewer_unparsed")
    return { id: user.id, handle: user.handle, name: user.name, tier: user.premium ? "premium" : "free" }
  }

  private async detail(tweetId: string, cursor?: string) {
    const json = await this.graphql("TweetDetail", {
      focalTweetId: tweetId,
      ...(cursor ? { cursor } : {}),
      referrer: "tweet",
      with_rux_injections: false,
      rankingMode: "Recency",
      includePromotedContent: true,
      withCommunity: true,
      withQuickPromoteEligibilityTweetFields: true,
      withBirdwatchNotes: true,
      withVoice: true,
    })
    return parseTweetDetail(json, tweetId)
  }

  async getTweet(id: string): Promise<Tweet> {
    const { focal } = await this.detail(id)
    if (!focal) throw new XError("not_found", "tweet_not_found")
    return { id: focal.id, authorId: focal.author.id, text: focal.text }
  }

  /** Newest first; stops paginating once a page brings no reply outside `known`. */
  async listReplies(tweetId: string, known: ReadonlySet<string> = new Set()): Promise<Reply[]> {
    const seen = new Map<string, ParsedTweet>()
    const queue: (string | undefined)[] = [undefined]
    const used = new Set<string>()
    for (let pages = 0; queue.length && pages < MAX_REPLY_PAGES; pages++) {
      const cursor = queue.shift()
      if (cursor) await this.wait(SCROLL_PAUSE[0] + Math.random() * (SCROLL_PAUSE[1] - SCROLL_PAUSE[0]))
      const page = await this.detail(tweetId, cursor)
      let fresh = 0
      for (const tweet of page.tweets) {
        if (!seen.has(tweet.id) && !known.has(tweet.id) && tweet.id !== tweetId) fresh++
        seen.set(tweet.id, tweet)
      }
      if (fresh === 0 && cursor) continue
      for (const next of page.cursors) {
        if (!used.has(next)) {
          used.add(next)
          queue.push(next)
        }
      }
    }

    const replies: Reply[] = []
    for (const tweet of seen.values()) {
      if (tweet.id === tweetId || !tweet.inReplyToId) continue
      const { followsMe, canDm, avatar } = tweet.author
      this.authors.set(tweet.author.id, { ...(followsMe === undefined ? {} : { followsMe }), ...(canDm === undefined ? {} : { canDm }) })
      replies.push({
        id: tweet.id,
        text: tweet.text,
        inReplyToId: tweet.inReplyToId,
        author: { id: tweet.author.id, handle: tweet.author.handle, name: tweet.author.name, ...(avatar ? { avatar } : {}) },
      })
    }
    return replies
  }

  async like(tweetId: string): Promise<void> {
    try {
      await this.graphql("FavoriteTweet", { tweet_id: tweetId })
    } catch (error) {
      // 139: already liked — the goal is reached.
      if (error instanceof XError && error.code === "x_139") return
      throw error
    }
  }

  async reply(toTweetId: string, text: string): Promise<void> {
    const json = await this.graphql("CreateTweet", {
      tweet_text: text,
      reply: { in_reply_to_tweet_id: toTweetId, exclude_reply_user_ids: [] },
      dark_request: false,
      media: { media_entities: [], possibly_sensitive: false },
      semantic_annotation_ids: [],
      disallowed_reply_options: null,
    })
    const created = (json as { data?: { create_tweet?: { tweet_results?: { result?: { rest_id?: string } } } } }).data
      ?.create_tweet?.tweet_results?.result?.rest_id
    // An empty result without errors has been seen on shadow-limited writes.
    if (!created) throw new XError("transient", "reply_not_created")
  }

  async relationship(userId: string): Promise<Relationship> {
    const response = await this.raw({
      method: "GET",
      path: "/i/api/1.1/dm/permissions.json",
      query: { recipient_ids: userId, dm_users: "true" },
    })
    const error = toXError(response)
    if (error) throw error
    const permission = (response.json as { permissions?: { id_keys?: Record<string, { can_dm?: boolean }> } })?.permissions
      ?.id_keys?.[userId]
    const known = this.authors.get(userId)
    return { canDm: permission?.can_dm ?? known?.canDm ?? false, followsMe: known?.followsMe ?? false }
  }

  async sendDm(userId: string, text: string, links: readonly string[]): Promise<"sent" | "already_sent"> {
    const conversationId = await this.conversationId(userId)
    const { x } = await this.config.get()
    if (x.dmMode === "xchat_ui") return this.sendViaXChat(conversationId, text, links, x.xchat)
    await this.sendViaLegacy(conversationId, text)
    return "sent"
  }

  /** 1:1 conversation id, the same for XChat and the legacy API: both user ids, numerically sorted. */
  private async conversationId(userId: string): Promise<string> {
    const me = this.me ?? (await this.bridge<string | null>("viewerId"))
    if (!me) throw new XError("session_expired", "logged_out")
    const [low, high] = [me, userId].sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1))
    return `${low}-${high}`
  }

  /** Reads the last DMs first: the link already there means it was sent, by the extension or by hand. */
  private async sendViaXChat(
    conversationId: string,
    text: string,
    links: readonly string[],
    selectors: Config["x"]["xchat"]
  ): Promise<"sent" | "already_sent"> {
    if (!this.chat) throw new XError("xchat_unavailable", "xchat_no_tab")
    await this.chat.open(`https://x.com/i/chat/${conversationId}`)
    const read = await this.chat.run(readConversation, [selectors, XCHAT_HISTORY, XCHAT_LOAD_TIMEOUT])
    switch (read.state) {
      case "locked":
        throw new XError("xchat_locked", "xchat_locked")
      case "closed":
        throw new XError("dm_closed", "xchat_closed")
      case "missing":
        throw new XError("xchat_unavailable", `xchat_no_${read.marker}`)
    }
    if (read.messages.some((message) => containsLink(message, links))) return "already_sent"

    const sent = await this.chat.run(sendMessage, [selectors, text, XCHAT_SEND_TIMEOUT, DEFAULT_TYPING_PACE])
    if (sent.state === "no_send_button") throw new XError("xchat_unavailable", "xchat_no_send")
    // Retried later: the DMs are read again first, so a message that did go out is not sent twice.
    if (sent.state === "unconfirmed") throw new XError("transient", "xchat_unconfirmed")
    return "sent"
  }

  private async sendViaLegacy(conversationId: string, text: string): Promise<void> {
    const response = await this.raw({
      method: "POST",
      path: "/i/api/1.1/dm/new2.json",
      body: {
        conversation_id: conversationId,
        recipient_ids: false,
        request_id: crypto.randomUUID(),
        text,
        cards_platform: "Web-12",
        include_cards: 1,
        include_quote_count: true,
        dm_users: false,
      },
    })
    const error = toXError(response)
    if (error) throw error
    const sent = (response.json as { entries?: { message?: unknown }[] })?.entries?.some((e) => e.message)
    if (!sent) throw new XError("dm_closed", "dm_not_delivered")
  }
}
