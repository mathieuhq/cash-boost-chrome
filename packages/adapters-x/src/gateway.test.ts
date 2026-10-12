import { DEFAULT_CONFIG, type Config } from "@super-x/application"
import { beforeEach, describe, expect, it } from "vitest"

import detail from "./__fixtures__/tweet-detail.json"
import { XWebGateway, type PageRunner } from "./gateway"
import { BRIDGE_KEY, type Discovery, type PageRequest, type PageResponse } from "./page/bridge"
import { readConversation, sendMessage, type ChatPage, type ConversationState, type SendState } from "./xchat"

const FOCAL = "1900000000000000001"

class FakeBridge {
  viewer: string | null = "111"
  requests: PageRequest[] = []
  responses: ((request: PageRequest) => PageResponse | undefined)[] = []
  discovery: Discovery | null = null
  version = 1 as const

  viewerId() {
    return this.viewer
  }
  async request(request: PageRequest): Promise<PageResponse> {
    this.requests.push(request)
    for (const respond of this.responses) {
      const response = respond(request)
      if (response) return response
    }
    return { status: 200, json: { data: {} } }
  }
  async discover() {
    return this.discovery
  }
  on(match: (request: PageRequest) => boolean, ...responses: PageResponse[]) {
    this.responses.push((request) => (match(request) ? (responses.length > 1 ? responses.shift() : responses[0]) : undefined))
  }
}

class FakeChat implements ChatPage {
  opened: string[] = []
  conversation: ConversationState = { state: "ready", messages: [] }
  sending: SendState = { state: "sent" }
  sent: string[] = []
  async open(url: string) {
    this.opened.push(url)
  }
  async run<A extends unknown[], R>(func: (...args: A) => R | Promise<R>, args: A): Promise<Awaited<R>> {
    if (func === (readConversation as unknown)) return this.conversation as Awaited<R>
    if (func === (sendMessage as unknown)) {
      if (this.sending.state === "sent") this.sent.push(args[1] as string)
      return this.sending as Awaited<R>
    }
    throw new Error("unexpected page function")
  }
}

let bridge: FakeBridge
let chat: FakeChat
let gateway: XWebGateway
let settings: Config
const config = { get: async () => settings }

beforeEach(() => {
  bridge = new FakeBridge()
  ;(globalThis as Record<string, unknown>).window = { [BRIDGE_KEY]: bridge }
  const runner: PageRunner = {
    run: async (func, args) => func(...args) as never,
    reload: async () => undefined,
  }
  settings = structuredClone(DEFAULT_CONFIG)
  chat = new FakeChat()
  gateway = new XWebGateway(runner, config, chat)
})

const op = (name: string) => (r: PageRequest) => r.path.endsWith(`/${name}`)
const variables = (r: PageRequest) => JSON.parse(r.query?.variables ?? JSON.stringify((r.body as { variables: unknown }).variables))

describe("XWebGateway", () => {
  it("identifies the account from twid + Viewer, Premium from is_blue_verified", async () => {
    bridge.on(op("Viewer"), {
      status: 200,
      json: { data: { viewer: { user_results: { result: { __typename: "User", rest_id: "111", core: { screen_name: "me", name: "Me" }, is_blue_verified: true } } } } },
    })
    expect(await gateway.whoami()).toEqual({ id: "111", handle: "me", name: "Me", tier: "premium" })
  })

  it("reports a missing session when x.com has no twid cookie", async () => {
    bridge.viewer = null
    await expect(gateway.whoami()).rejects.toMatchObject({ kind: "session_expired" })
  })

  it("lists direct and nested replies with Recency ranking, without the focal tweet", async () => {
    bridge.on(op("TweetDetail"), { status: 200, json: detail }, { status: 200, json: { data: {} } })
    const replies = await gateway.listReplies(FOCAL)
    expect(replies.map((r) => [r.id, r.inReplyToId])).toEqual([
      ["1900000000000000050", FOCAL],
      ["1900000000000000060", "1900000000000000050"],
      ["1900000000000000070", FOCAL],
    ])
    expect(variables(bridge.requests[0]!)).toMatchObject({ focalTweetId: FOCAL, rankingMode: "Recency" })
    expect(variables(bridge.requests[1]!)).toMatchObject({ cursor: "DAAKCgABHPEX" })
  })

  it("stops paginating when a page only brings known comments", async () => {
    bridge.on(op("TweetDetail"), { status: 200, json: detail })
    await gateway.listReplies(FOCAL, new Set(["1900000000000000050", "1900000000000000060", "1900000000000000070"]))
    expect(bridge.requests).toHaveLength(2)
  })

  it("adds missing features from a 336 error and retries once", async () => {
    bridge.on(
      op("TweetDetail"),
      { status: 400, json: { errors: [{ code: 336, message: "The following features cannot be null: brand_new_flag" }] } },
      { status: 200, json: detail }
    )
    const tweet = await gateway.getTweet(FOCAL)
    expect(tweet).toEqual({ id: FOCAL, authorId: "111", text: "Reply 'GUIDE' and I'll DM it" })
    expect(JSON.parse(bridge.requests[1]!.query!.features!)).toMatchObject({ brand_new_flag: false })
  })

  it("treats a GraphQL 404 as transient, not as a missing tweet", async () => {
    bridge.on(op("TweetDetail"), { status: 404, json: null })
    await expect(gateway.getTweet(FOCAL)).rejects.toMatchObject({ kind: "transient", code: "gql_404_TweetDetail" })
  })

  it("accepts an already-liked comment", async () => {
    bridge.on(op("FavoriteTweet"), { status: 200, json: { errors: [{ code: 139 }] } })
    await expect(gateway.like("50")).resolves.toBeUndefined()
  })

  it("fails a reply that X did not create", async () => {
    bridge.on(op("CreateTweet"), { status: 200, json: { data: { create_tweet: { tweet_results: {} } } } })
    await expect(gateway.reply("50", "hi")).rejects.toMatchObject({ kind: "transient", code: "reply_not_created" })
  })

  it("trips on 226 while replying", async () => {
    bridge.on(op("CreateTweet"), { status: 200, json: { errors: [{ code: 226, message: "automated" }], data: {} } })
    await expect(gateway.reply("50", "hi")).rejects.toMatchObject({ kind: "restriction", code: "x_226" })
  })

  it("sends a 1:1 legacy DM on the numerically sorted conversation id", async () => {
    settings.x.dmMode = "api"
    bridge.on((r) => r.path.endsWith("new2.json"), { status: 200, json: { entries: [{ message: { id: "1" } }] } })
    await gateway.sendDm("99", "Salut", [])
    expect(bridge.requests[0]!.body).toMatchObject({ conversation_id: "99-111", text: "Salut", recipient_ids: false })
  })

  it("maps a refused legacy DM to dm_closed", async () => {
    settings.x.dmMode = "api"
    bridge.on((r) => r.path.endsWith("new2.json"), { status: 403, json: { errors: [{ code: 349 }] } })
    await expect(gateway.sendDm("222", "Salut", [])).rejects.toMatchObject({ kind: "dm_closed" })
  })

  describe("XChat", () => {
    const LINKS = ["pim.ms/0qtKj00"]

    it("opens the conversation in the dedicated tab and sends when the link is not in the last DMs", async () => {
      chat.conversation = { state: "ready", messages: ["salut", "autre lien : pim.ms/AUTRE"] }
      expect(await gateway.sendDm("99", "voilà le guide : pim.ms/0qtKj00", LINKS)).toBe("sent")
      expect(chat.opened).toEqual(["https://x.com/i/chat/99-111"])
      expect(chat.sent).toEqual(["voilà le guide : pim.ms/0qtKj00"])
      expect(bridge.requests.filter((r) => r.path.includes("/dm/"))).toEqual([])
    })

    it("does not send when the link is already in the DMs, whoever wrote it", async () => {
      chat.conversation = { state: "ready", messages: ["hello, voilà le guide : pim.ms/0qtKj00\nhttps://pim.ms/0qtKj00"] }
      expect(await gateway.sendDm("99", "voilà le guide : pim.ms/0qtKj00", LINKS)).toBe("already_sent")
      expect(chat.sent).toEqual([])
    })

    it("stops on a locked XChat", async () => {
      chat.conversation = { state: "locked" }
      await expect(gateway.sendDm("99", "x", LINKS)).rejects.toMatchObject({ kind: "xchat_locked" })
    })

    it("treats a conversation without composer as closed DMs", async () => {
      chat.conversation = { state: "closed" }
      await expect(gateway.sendDm("99", "x", LINKS)).rejects.toMatchObject({ kind: "dm_closed", code: "xchat_closed" })
    })

    it("reports a missing marker as an XChat change", async () => {
      chat.conversation = { state: "missing", marker: "root" }
      await expect(gateway.sendDm("99", "x", LINKS)).rejects.toMatchObject({ kind: "xchat_unavailable", code: "xchat_no_root" })
      chat.conversation = { state: "ready", messages: [] }
      chat.sending = { state: "no_send_button" }
      await expect(gateway.sendDm("99", "x", LINKS)).rejects.toMatchObject({ kind: "xchat_unavailable", code: "xchat_no_send" })
    })

    it("retries later a message X did not confirm", async () => {
      chat.sending = { state: "unconfirmed" }
      await expect(gateway.sendDm("99", "x", LINKS)).rejects.toMatchObject({ kind: "transient", code: "xchat_unconfirmed" })
    })
  })

  it("combines DM permissions with who follows us from the last scan", async () => {
    bridge.on(op("TweetDetail"), { status: 200, json: detail }, { status: 200, json: { data: {} } })
    bridge.on((r) => r.path.endsWith("permissions.json"), {
      status: 200,
      json: { permissions: { id_keys: { "222": { can_dm: false } } } },
    })
    await gateway.listReplies(FOCAL)
    expect(await gateway.relationship("222")).toEqual({ canDm: false, followsMe: true })
  })
})
