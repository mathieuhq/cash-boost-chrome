import { describe, expect, it } from "vitest"

import { Engine, type CampaignInput } from "./engine"
import { XError } from "./ports"
import { fakeDeps, ME, TEST_TEMPLATES } from "./testing"

const MIN = 60_000
const HOUR = 60 * MIN

const TWEET = { id: "500", authorId: ME.id, text: "Commente GUIDE" }

const input = (patch: Partial<CampaignInput> = {}): CampaignInput => ({
  tweetUrl: `https://x.com/me/status/${TWEET.id}`,
  keyword: "GUIDE",
  leadMagnetUrl: "https://notion.so/guide",
  templates: TEST_TEMPLATES,
  mustFollow: false,
  durationHours: 48,
  ...patch,
})

async function setup() {
  const deps = fakeDeps()
  deps.x.addTweet(TWEET)
  const engine = new Engine(deps)
  await engine.connect()
  await engine.acceptTos()
  return { deps, engine }
}

async function withCampaign(patch: Partial<CampaignInput> = {}) {
  const ctx = await setup()
  const result = await ctx.engine.launchCampaign(input(patch))
  if (!result.ok) throw new Error(result.error)
  return { ...ctx, campaignId: result.campaignId }
}

const author = (id: string, name = `User ${id}`) => ({ id, handle: `user${id}`, name })

/** Runs actions until the queue is empty, moving the clock past the random delay each time. */
async function drain(ctx: Awaited<ReturnType<typeof setup>>, max = 50) {
  for (let i = 0; i < max; i++) {
    ctx.deps.clock.advance(2 * MIN)
    const done = await ctx.engine.act()
    if (done === "idle") return
  }
}

describe("connect", () => {
  it("keeps one state per X account", async () => {
    const { deps, engine } = await setup()
    expect(deps.store.state.account.id).toBe(ME.id)
    expect(deps.store.state.tosAccepted).toBe(true)

    deps.x.account = { ...ME, id: "200", handle: "other" }
    await engine.connect()
    expect(deps.store.state.account.id).toBe("200")
    expect(deps.store.state.tosAccepted).toBe(false)
  })

  it("reports a missing x.com session", async () => {
    const deps = fakeDeps()
    deps.x.account = null
    expect(await new Engine(deps).connect()).toEqual({ ok: false, error: "x_logged_out" })
  })
})

describe("launchCampaign", () => {
  it("creates an active Campaign and scans right away", async () => {
    const { deps, engine } = await setup()
    const result = await engine.launchCampaign(input())
    expect(result.ok).toBe(true)
    const [campaign] = deps.store.state.campaigns
    expect(campaign).toMatchObject({
      status: "active",
      keyword: "GUIDE",
      endsAt: deps.clock.time + 48 * HOUR,
      sourceTweet: { id: TWEET.id, authorId: ME.id, text: TWEET.text },
    })
    expect(deps.scheduler.ticks).toContain(deps.clock.time)
  })

  it("only accepts the connected account's own tweets", async () => {
    const { deps, engine } = await setup()
    deps.x.addTweet({ id: "501", authorId: "999", text: "" })
    expect(await engine.launchCampaign(input({ tweetUrl: "https://x.com/someone/status/501" }))).toEqual({
      ok: false,
      error: "not_your_tweet",
    })
  })

  it("rejects invalid drafts", async () => {
    const { engine } = await setup()
    expect(await engine.launchCampaign(input({ tweetUrl: "nope" }))).toEqual({ ok: false, error: "invalid_tweet_url" })
    expect(await engine.launchCampaign(input({ keyword: " " }))).toEqual({ ok: false, error: "invalid_draft" })
    expect(
      await engine.launchCampaign(input({ templates: { ...TEST_TEMPLATES, dm: ["one"] } }))
    ).toEqual({ ok: false, error: "invalid_draft" })
  })

  it("requires the risk warning to be accepted", async () => {
    const deps = fakeDeps()
    deps.x.addTweet(TWEET)
    const engine = new Engine(deps)
    await engine.connect()
    expect(await engine.launchCampaign(input())).toEqual({ ok: false, error: "tos_not_accepted" })
  })

  it("allows 3 active Campaigns at most", async () => {
    const { engine } = await setup()
    for (let i = 0; i < 3; i++) expect((await engine.launchCampaign(input())).ok).toBe(true)
    expect(await engine.launchCampaign(input())).toEqual({ ok: false, error: "too_many_campaigns" })
  })

  it("starts the Trial on the first Campaign, once", async () => {
    const { deps, engine } = await setup()
    deps.access.entitlement = { kind: "none", trialAvailable: true }
    expect((await engine.launchCampaign(input())).ok).toBe(true)
    expect(deps.access.trialsStarted).toEqual([ME.id])

    deps.access.entitlement = { kind: "none", trialAvailable: false }
    expect(await engine.launchCampaign(input())).toEqual({ ok: false, error: "no_entitlement" })
  })
})

describe("tick: scanning Comments", () => {
  it("stays quiet when no Campaign runs", async () => {
    const { deps, engine } = await setup()
    deps.x.account = null
    await engine.tick()
    expect(deps.scheduler.ticks).toEqual([])
    expect(deps.store.state.breaker).toBeNull()
  })

  it("turns exact Keyword matches into Leads", async () => {
    const ctx = await withCampaign()
    ctx.deps.x.addReply(TWEET.id, { id: "r1", text: "@me GUIDE 🙏", author: author("1", "Marie Dupont") })
    await ctx.engine.tick()
    expect(ctx.deps.store.state.leads).toMatchObject([
      { author: { id: "1" }, comment: { id: "r1" }, matchedBy: "exact", delivery: "queued" },
    ])
    expect(ctx.deps.classifier.batches).toEqual([])
  })

  it("asks Jev about the rest: accept, review or reject", async () => {
    const ctx = await withCampaign()
    ctx.deps.x.addReply(TWEET.id, { id: "r1", text: "je veux le tuto", author: author("1") })
    ctx.deps.x.addReply(TWEET.id, { id: "r2", text: "intéressant", author: author("2") })
    ctx.deps.x.addReply(TWEET.id, { id: "r3", text: "bof", author: author("3") })
    ctx.deps.classifier.probabilities.set("je veux le tuto", 0.9)
    ctx.deps.classifier.probabilities.set("intéressant", 0.5)
    ctx.deps.classifier.probabilities.set("bof", 0.1)
    await ctx.engine.tick()

    const state = ctx.deps.store.state
    expect(state.leads).toMatchObject([{ comment: { id: "r1" }, matchedBy: "classified", probability: 0.9 }])
    expect(state.reviews).toMatchObject([{ comment: { id: "r2" }, probability: 0.5 }])
    expect(state.campaigns[0]!.seenCommentIds).toEqual(expect.arrayContaining(["r1", "r2", "r3"]))
  })

  it("ignores nested replies, the account's own replies and already-seen Comments", async () => {
    const ctx = await withCampaign()
    ctx.deps.x.addReply(TWEET.id, { id: "r1", text: "GUIDE", author: author("1"), inReplyToId: "other" })
    ctx.deps.x.addReply(TWEET.id, { id: "r2", text: "GUIDE", author: { id: ME.id, handle: "me", name: "Moi" } })
    ctx.deps.x.addReply(TWEET.id, { id: "r3", text: "GUIDE", author: author("3") })
    await ctx.engine.tick()
    await ctx.engine.tick()
    expect(ctx.deps.store.state.leads.map((l) => l.comment.id)).toEqual(["r3"])
  })

  it("processes a person once per Campaign", async () => {
    const ctx = await withCampaign()
    ctx.deps.x.addReply(TWEET.id, { id: "r1", text: "GUIDE", author: author("1") })
    ctx.deps.x.addReply(TWEET.id, { id: "r2", text: "GUIDE stp", author: author("1") })
    await ctx.engine.tick()
    expect(ctx.deps.store.state.leads).toHaveLength(1)
  })

  it("leaves Comments for the next Tick when Jev is unavailable", async () => {
    const ctx = await withCampaign()
    ctx.deps.x.addReply(TWEET.id, { id: "r1", text: "je veux", author: author("1") })
    ctx.deps.classifier.unavailable = new (await import("./ports")).ClassifierUnavailable("unavailable")
    await ctx.engine.tick()
    expect(ctx.deps.store.state.campaigns[0]!.seenCommentIds).toEqual([])

    ctx.deps.classifier.unavailable = null
    ctx.deps.classifier.probabilities.set("je veux", 0.8)
    await ctx.engine.tick()
    expect(ctx.deps.store.state.leads).toHaveLength(1)
  })

  it("finishes Campaigns past their duration", async () => {
    const ctx = await withCampaign({ durationHours: 24 })
    ctx.deps.clock.advance(24 * HOUR)
    await ctx.engine.tick()
    expect(ctx.deps.store.state.campaigns[0]!.status).toBe("finished")
  })

  it("schedules the next Tick 5 to 15 min later and an Action when work is waiting", async () => {
    const ctx = await withCampaign()
    ctx.deps.x.addReply(TWEET.id, { id: "r1", text: "GUIDE", author: author("1") })
    await ctx.engine.tick()
    expect(ctx.deps.scheduler.ticks.at(-1)).toBe(ctx.deps.clock.time + 5 * MIN)
    expect(ctx.deps.scheduler.actions.at(-1)).toBe(ctx.deps.clock.time)
  })
})

describe("act: processing Leads", () => {
  it("sends the DM with the lead magnet, then likes and acknowledges publicly", async () => {
    const ctx = await withCampaign()
    ctx.deps.x.addReply(TWEET.id, { id: "r1", text: "GUIDE", author: author("1", "Marie Dupont") })
    await ctx.engine.tick()
    await drain(ctx)

    expect(ctx.deps.x.calls).toEqual([
      "dm 1 Salut Marie !\nhttps://notion.so/guide",
      "like r1",
      "reply r1 C'est envoyé en DM @user1",
    ])
    expect(ctx.deps.store.state.leads[0]).toMatchObject({ liked: true, delivery: "sent", ack: "sent" })
    expect(ctx.deps.store.state.history.map((r) => r.kind)).toEqual(["dm", "like", "reply"])
  })

  it("does not send the link again when it is already in the DMs, but likes and acknowledges", async () => {
    const ctx = await withCampaign()
    ctx.deps.x.inbox.set("1", ["notion.so/guide"])
    ctx.deps.x.addReply(TWEET.id, { id: "r1", text: "GUIDE", author: author("1") })
    await ctx.engine.tick()
    await drain(ctx)

    expect(ctx.deps.x.calls).toEqual(["like r1", "reply r1 C'est envoyé en DM @user1"])
    expect(ctx.deps.store.state.leads[0]).toMatchObject({ delivery: "sent", alreadySent: true, ack: "sent" })
    expect(ctx.deps.store.state.history.map((r) => r.kind)).toEqual(["like", "reply"])
  })

  it("skips the DMs check when the extension already sent this lead magnet from another Campaign", async () => {
    const ctx = await withCampaign()
    ctx.deps.x.addTweet({ id: "600", authorId: ME.id, text: "" })
    ctx.deps.x.addReply(TWEET.id, { id: "r1", text: "GUIDE", author: author("1") })
    await ctx.engine.tick()
    await drain(ctx)
    await ctx.engine.launchCampaign(input({ tweetUrl: "https://x.com/me/status/600", leadMagnetUrl: "https://www.notion.so/guide/" }))
    ctx.deps.x.addReply("600", { id: "r2", text: "GUIDE", author: author("1") })
    await ctx.engine.tick()
    await drain(ctx)

    expect(ctx.deps.x.calls.filter((c) => c.startsWith("dm "))).toHaveLength(1)
    expect(ctx.deps.store.state.leads.find((l) => l.comment.id === "r2")).toMatchObject({ alreadySent: true, ack: "sent" })
  })

  it("sends another lead magnet to the same person", async () => {
    const ctx = await withCampaign()
    ctx.deps.x.inbox.set("1", ["notion.so/guide"])
    ctx.deps.x.addTweet({ id: "600", authorId: ME.id, text: "" })
    await ctx.engine.launchCampaign(input({ tweetUrl: "https://x.com/me/status/600", leadMagnetUrl: "https://pim.ms/autre" }))
    ctx.deps.x.addReply("600", { id: "r2", text: "GUIDE", author: author("1") })
    await ctx.engine.tick()
    await drain(ctx)
    expect(ctx.deps.x.calls[0]).toBe("dm 1 Salut User !\nhttps://pim.ms/autre")
  })

  it("only processes the Comment that asks for the lead magnet when a person comments twice", async () => {
    const ctx = await withCampaign()
    ctx.deps.x.addReply(TWEET.id, { id: "r1", text: "je reconnais une personne qui s'inspire", author: author("1") })
    ctx.deps.x.addReply(TWEET.id, { id: "r2", text: "GUIDE", author: author("1") })
    await ctx.engine.tick()
    await drain(ctx)
    expect(ctx.deps.store.state.leads.map((l) => l.comment.id)).toEqual(["r2"])
    expect(ctx.deps.x.calls).toContain("like r2")
    expect(ctx.deps.x.calls).not.toContain("like r1")
  })

  it("asks to open DMs when they are closed, and retries at the next Tick", async () => {
    const ctx = await withCampaign()
    ctx.deps.x.addReply(TWEET.id, { id: "r1", text: "GUIDE", author: author("1") })
    ctx.deps.x.closedDms.add("1")
    await ctx.engine.tick()
    await drain(ctx)
    expect(ctx.deps.x.calls).toEqual(["like r1", "reply r1 Ouvre tes DMs @user1"])
    expect(ctx.deps.store.state.leads[0]).toMatchObject({ delivery: "dm_closed", ack: "dm_closed", dmAttempts: 1 })

    ctx.deps.x.closedDms.delete("1")
    await ctx.engine.tick()
    await drain(ctx)
    expect(ctx.deps.x.calls.at(-1)).toMatch(/^dm 1 /)
    expect(ctx.deps.store.state.leads[0]).toMatchObject({ delivery: "sent", ack: "dm_closed" })
  })

  it("checks the legacy DM permission only with the legacy endpoint", async () => {
    const ctx = await withCampaign()
    ctx.deps.config.config.x.dmMode = "api"
    ctx.deps.x.addReply(TWEET.id, { id: "r1", text: "GUIDE", author: author("1") })
    ctx.deps.x.relationships.set("1", { followsMe: false, canDm: false })
    await ctx.engine.tick()
    await ctx.engine.act()
    expect(ctx.deps.store.state.leads[0]).toMatchObject({ delivery: "dm_closed" })
  })

  it("treats a refused DM as closed", async () => {
    const ctx = await withCampaign()
    ctx.deps.x.addReply(TWEET.id, { id: "r1", text: "GUIDE", author: author("1") })
    await ctx.engine.tick()
    ctx.deps.x.failNext = new XError("dm_closed", "x_349")
    await ctx.engine.act()
    expect(ctx.deps.store.state.leads[0]).toMatchObject({ delivery: "dm_closed" })
  })

  it("only DMs followers when the Campaign requires it", async () => {
    const ctx = await withCampaign({ mustFollow: true })
    ctx.deps.x.addReply(TWEET.id, { id: "r1", text: "GUIDE", author: author("1") })
    ctx.deps.x.relationships.set("1", { followsMe: false, canDm: true })
    await ctx.engine.tick()
    await drain(ctx)
    expect(ctx.deps.store.state.leads[0]).toMatchObject({ delivery: "dm_closed" })
  })

  it("puts the link in the public reply when RemoteConfig says DMs are off", async () => {
    const ctx = await withCampaign()
    ctx.deps.config.config.x.dmMode = "public_reply"
    ctx.deps.x.addReply(TWEET.id, { id: "r1", text: "GUIDE", author: author("1", "Marie") })
    await ctx.engine.tick()
    await drain(ctx)
    expect(ctx.deps.x.calls).toEqual(["like r1", "reply r1 Salut Marie !\nhttps://notion.so/guide"])
    expect(ctx.deps.store.state.leads[0]).toMatchObject({ delivery: "sent", ack: "sent" })
  })

  it("waits 30 to 120 s between two Actions", async () => {
    const ctx = await withCampaign()
    ctx.deps.x.addReply(TWEET.id, { id: "r1", text: "GUIDE", author: author("1") })
    await ctx.engine.tick()
    await ctx.engine.act()
    expect(ctx.deps.scheduler.actions.at(-1)).toBe(ctx.deps.clock.time + 30_000)
    await ctx.engine.act()
    expect(ctx.deps.x.calls).toHaveLength(1)
  })

  it("serves Campaigns in turn", async () => {
    const ctx = await withCampaign()
    ctx.deps.x.addTweet({ id: "600", authorId: ME.id, text: "" })
    await ctx.engine.launchCampaign(input({ tweetUrl: "https://x.com/me/status/600" }))
    ctx.deps.x.addReply(TWEET.id, { id: "a1", text: "GUIDE", author: author("1") })
    ctx.deps.x.addReply(TWEET.id, { id: "a2", text: "GUIDE", author: author("2") })
    ctx.deps.x.addReply("600", { id: "b1", text: "GUIDE", author: author("3") })
    await ctx.engine.tick()
    for (let i = 0; i < 3; i++) {
      ctx.deps.clock.advance(2 * MIN)
      await ctx.engine.act()
    }
    // The newest Campaign is listed (and served) first.
    expect(ctx.deps.x.calls).toEqual([expect.stringMatching(/^dm 3 /), expect.stringMatching(/^dm 1 /), "like b1"])
  })

  it("lets Leads wait in the queue once a Quota is reached", async () => {
    const ctx = await withCampaign()
    ctx.deps.config.config.limits.free.dm = 0
    ctx.deps.x.addReply(TWEET.id, { id: "r1", text: "GUIDE", author: author("1") })
    await ctx.engine.tick()
    await drain(ctx)
    // Nothing public happens before the DMs are checked.
    expect(ctx.deps.x.calls).toEqual([])
    expect(ctx.deps.store.state.leads[0]!.delivery).toBe("queued")
  })

  it("skips a like on a deleted Comment and goes on", async () => {
    const ctx = await withCampaign()
    ctx.deps.x.addReply(TWEET.id, { id: "r1", text: "GUIDE", author: author("1") })
    await ctx.engine.tick()
    await ctx.engine.act()
    ctx.deps.clock.advance(2 * MIN)
    ctx.deps.x.failNext = new XError("not_found", "x_144")
    await drain(ctx)
    expect(ctx.deps.store.state.leads[0]).toMatchObject({ liked: true, delivery: "sent", ack: "sent" })
  })

  it("marks a Lead failed after 3 transient errors on the same step", async () => {
    const ctx = await withCampaign()
    ctx.deps.x.addReply(TWEET.id, { id: "r1", text: "GUIDE", author: author("1") })
    await ctx.engine.tick()
    for (let i = 0; i < 3; i++) {
      ctx.deps.x.failNext = new XError("transient", "http_500")
      ctx.deps.clock.advance(2 * MIN)
      await ctx.engine.act()
    }
    expect(ctx.deps.store.state.leads[0]).toMatchObject({ delivery: "failed" })
    expect(ctx.deps.reporter.codes).toEqual(["http_500", "http_500", "http_500"])
  })
})

describe("CircuitBreaker", () => {
  it("stops everything on an X restriction and only allows a restart after 24 h", async () => {
    const ctx = await withCampaign()
    ctx.deps.x.addReply(TWEET.id, { id: "r1", text: "GUIDE", author: author("1") })
    await ctx.engine.tick()
    ctx.deps.x.failNext = new XError("restriction", "x_226")
    await ctx.engine.act()

    const state = ctx.deps.store.state
    expect(state.breaker).toMatchObject({ reason: "x_restriction", code: "x_226" })
    expect(state.campaigns[0]).toMatchObject({ status: "paused", stoppedBy: "breaker" })
    expect(await ctx.engine.restart()).toEqual({ ok: false, error: "too_early" })

    ctx.deps.clock.advance(24 * HOUR)
    expect(await ctx.engine.restart()).toEqual({ ok: true })
    expect(ctx.deps.store.state.campaigns[0]!.status).toBe("active")
  })

  it("pauses every Campaign while XChat waits for the passcode, until a restart", async () => {
    const ctx = await withCampaign()
    ctx.deps.x.addReply(TWEET.id, { id: "r1", text: "GUIDE", author: author("1") })
    await ctx.engine.tick()
    ctx.deps.x.failNext = new XError("xchat_locked", "xchat_locked")
    await ctx.engine.act()

    const state = ctx.deps.store.state
    expect(state.breaker).toMatchObject({ reason: "xchat_locked" })
    expect(state.campaigns[0]).toMatchObject({ status: "paused", stoppedBy: "breaker" })
    expect(state.leads[0]).toMatchObject({ delivery: "queued" })
    expect(await ctx.engine.restart()).toEqual({ ok: true })
    expect(ctx.deps.store.state.campaigns[0]).toMatchObject({ status: "active" })
  })

  it("pauses every Campaign when the XChat page changed", async () => {
    const ctx = await withCampaign()
    ctx.deps.x.addReply(TWEET.id, { id: "r1", text: "GUIDE", author: author("1") })
    await ctx.engine.tick()
    ctx.deps.x.failNext = new XError("xchat_unavailable", "xchat_no_composer")
    await ctx.engine.act()
    expect(ctx.deps.store.state.breaker).toMatchObject({ reason: "xchat_unavailable", code: "xchat_no_composer" })
    expect(ctx.deps.reporter.codes).toEqual(["xchat_no_composer"])
  })

  it("trips on a restriction while scanning", async () => {
    const ctx = await withCampaign()
    ctx.deps.x.failListing = new XError("restriction", "http_429")
    await ctx.engine.tick()
    expect(ctx.deps.store.state.breaker?.reason).toBe("x_restriction")
  })

  it("resumes by itself once the x.com session is back", async () => {
    const ctx = await withCampaign()
    ctx.deps.x.failListing = new XError("session_expired", "http_401")
    await ctx.engine.tick()
    expect(ctx.deps.store.state.breaker?.reason).toBe("session_expired")

    ctx.deps.x.failListing = null
    await ctx.engine.tick()
    expect(ctx.deps.store.state.breaker).toBeNull()
    expect(ctx.deps.store.state.campaigns[0]!.status).toBe("active")
  })

  it("kill switch stops and restart resumes only what the breaker stopped", async () => {
    const ctx = await withCampaign()
    ctx.deps.x.addTweet({ id: "600", authorId: ME.id, text: "" })
    const second = await ctx.engine.launchCampaign(input({ tweetUrl: "https://x.com/me/status/600" }))
    if (!second.ok) throw new Error()
    await ctx.engine.pause(second.campaignId)

    const status = (id: string) => ctx.deps.store.state.campaigns.find((c) => c.id === id)!.status
    await ctx.engine.killSwitch()
    expect([status(ctx.campaignId), status(second.campaignId)]).toEqual(["paused", "paused"])
    await ctx.engine.restart()
    expect([status(ctx.campaignId), status(second.campaignId)]).toEqual(["active", "paused"])
  })

  it("obeys the remote kill switch", async () => {
    const ctx = await withCampaign()
    ctx.deps.config.config.killSwitch = true
    await ctx.engine.tick()
    expect(ctx.deps.store.state.breaker?.reason).toBe("remote_kill")
    ctx.deps.config.config.killSwitch = false
    await ctx.engine.tick()
    expect(ctx.deps.store.state.breaker).toBeNull()
  })
})

describe("deleteCampaign", () => {
  it("removes the Campaign with its reviews and activity, archives its Leads and keeps the Quota history", async () => {
    const ctx = await withCampaign()
    ctx.deps.x.addReply(TWEET.id, { id: "r1", text: "GUIDE", author: author("1") })
    ctx.deps.x.addReply(TWEET.id, { id: "r2", text: "intéressant", author: author("2") })
    ctx.deps.classifier.probabilities.set("intéressant", 0.5)
    await ctx.engine.tick()
    await drain(ctx)
    const history = ctx.deps.store.state.history.length
    expect(history).toBeGreaterThan(0)

    const leads = ctx.deps.store.state.leads
    expect(leads.length).toBeGreaterThan(0)

    await ctx.engine.deleteCampaign(ctx.campaignId)
    const state = ctx.deps.store.state
    expect(state.campaigns).toEqual([])
    expect(state.leads).toEqual([])
    expect(state.archive).toEqual([
      { campaign: expect.objectContaining({ id: ctx.campaignId }), leads, deletedAt: ctx.deps.clock.now() },
    ])
    expect(state.reviews).toEqual([])
    expect(state.activity).toEqual([])
    expect(state.history).toHaveLength(history)
  })

  it("never acts on archived Leads", async () => {
    const ctx = await withCampaign()
    ctx.deps.x.addReply(TWEET.id, { id: "r1", text: "GUIDE", author: author("1") })
    await ctx.engine.tick()
    await ctx.engine.deleteCampaign(ctx.campaignId)
    const history = ctx.deps.store.state.history.length

    await drain(ctx)
    expect(ctx.deps.store.state.history).toHaveLength(history)
    expect(ctx.deps.store.state.archive![0]!.leads[0]!.delivery).toBe("queued")
  })

  it("frees a slot for a new Campaign", async () => {
    const ctx = await withCampaign()
    for (const id of ["600", "601"]) {
      ctx.deps.x.addTweet({ id, authorId: ME.id, text: "" })
      await ctx.engine.launchCampaign(input({ tweetUrl: `https://x.com/me/status/${id}` }))
    }
    ctx.deps.x.addTweet({ id: "602", authorId: ME.id, text: "" })
    const fourth = input({ tweetUrl: "https://x.com/me/status/602" })
    expect(await ctx.engine.launchCampaign(fourth)).toEqual({ ok: false, error: "too_many_campaigns" })

    await ctx.engine.deleteCampaign(ctx.campaignId)
    expect((await ctx.engine.launchCampaign(fourth)).ok).toBe(true)
  })
})

describe("access", () => {
  it("pauses Campaigns when the Entitlement ends and resumes them when it comes back", async () => {
    const ctx = await withCampaign()
    ctx.deps.access.entitlement = { kind: "none", trialAvailable: false }
    await ctx.engine.tick()
    expect(ctx.deps.store.state.campaigns[0]).toMatchObject({ status: "paused", stoppedBy: "access" })

    ctx.deps.access.entitlement = { kind: "paid", trialAvailable: false }
    await ctx.engine.tick()
    expect(ctx.deps.store.state.campaigns[0]!.status).toBe("active")
  })
})

describe("PendingReview", () => {
  async function withReview() {
    const ctx = await withCampaign()
    ctx.deps.x.addReply(TWEET.id, { id: "r1", text: "intéressant", author: author("1") })
    ctx.deps.classifier.probabilities.set("intéressant", 0.5)
    await ctx.engine.tick()
    return { ...ctx, reviewId: ctx.deps.store.state.reviews[0]!.id }
  }

  it("approving turns it into a Lead", async () => {
    const ctx = await withReview()
    await ctx.engine.approveReview(ctx.reviewId)
    expect(ctx.deps.store.state.reviews).toEqual([])
    expect(ctx.deps.store.state.leads).toMatchObject([{ matchedBy: "manual", probability: 0.5 }])
    expect(ctx.deps.scheduler.actions.at(-1)).toBe(ctx.deps.clock.time)
  })

  it("rejecting drops it", async () => {
    const ctx = await withReview()
    await ctx.engine.rejectReview(ctx.reviewId)
    expect(ctx.deps.store.state.reviews).toEqual([])
    expect(ctx.deps.store.state.leads).toEqual([])
  })
})
