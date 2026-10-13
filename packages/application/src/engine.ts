import {
  activeCount,
  between,
  campaignLinks,
  decide,
  effectiveLimits,
  hasQuota,
  isAwake,
  isExpired,
  isServed,
  localDay,
  MAX_ACTIVE_CAMPAIGNS,
  MAX_TITLE_LENGTH,
  matchesKeyword,
  newLead,
  nextStep,
  pendingCount,
  nextWakeAt,
  normalizeLink,
  parseTweetUrl,
  pickNextAction,
  pickVariantIndex,
  pruneHistory,
  rampFraction,
  renderTemplate,
  skewedBetween,
  templatesAreValid,
  type Campaign,
  type Lead,
  type MessageTemplates,
  type QuotaLimits,
  type Step,
  type TemplateFamily,
} from "@super-x/domain"

import { MAX_CLASSIFY_BATCH, type Config } from "./config"
import { ClassifierUnavailable, XError, type EngineDeps, type Reply, type XAccount } from "./ports"
import { ACTIVITY_PER_CAMPAIGN, type ActivityKind, type BreakerReason, type EngineState, type PendingReview } from "./state"

const SECOND = 1_000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const MAX_TRANSIENT_ERRORS = 3
/** Steps done on one Lead in a single sitting (DM, like, reply). */
const MAX_CHAIN = 3
/** An X restriction keeps the CircuitBreaker closed for at least this long. */
const RESTRICTION_COOLDOWN = 24 * HOUR

export interface CampaignInput {
  title?: string
  tweetUrl: string
  keyword: string
  leadMagnetUrl: string
  formerLinks?: string[]
  templates: MessageTemplates
  mustFollow: boolean
  durationHours: number
}

export type Result<E extends string, T = object> = ({ ok: true } & T) | { ok: false; error: E }

export type LaunchError =
  | "invalid_tweet_url"
  | "invalid_draft"
  | "x_not_connected"
  | "tos_not_accepted"
  | "breaker_active"
  | "too_many_campaigns"
  | "tweet_not_found"
  | "not_your_tweet"
  | "x_unreachable"

export type ActOutcome = "done" | "waiting" | "idle" | "blocked"

type Outcome =
  | { kind: "liked" }
  | { kind: "dm_sent"; viaReply: boolean }
  | { kind: "dm_already_sent" }
  | { kind: "dm_closed" }
  | { kind: "replied"; ack: "sent" | "dm_closed" }
  | { kind: "gone"; step: Step }
  | { kind: "error"; error: XError }

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim())
    return url.protocol === "https:" || url.protocol === "http:"
  } catch {
    return false
  }
}

/**
 * The local engine: one instance per service worker (composition root, ADR 0002).
 * Writes to the state are serialized; network calls happen outside the lock and are merged after.
 */
export class Engine {
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private readonly deps: EngineDeps) {}

  // ── Commands from the side panel ──────────────────────────────────────────

  /** Detects the X account logged into x.com and makes its state the current one. */
  async connect(): Promise<Result<"x_logged_out" | "x_unreachable", { account: XAccount }>> {
    let account: XAccount
    try {
      account = await this.deps.x.whoami()
    } catch (error) {
      const loggedOut = error instanceof XError && error.kind === "session_expired"
      return { ok: false, error: loggedOut ? "x_logged_out" : "x_unreachable" }
    }
    await this.useAccount(account)
    return { ok: true, account }
  }

  async acceptTos(): Promise<void> {
    await this.withState((s) => {
      s.tosAccepted = true
    })
  }

  async launchCampaign(input: CampaignInput): Promise<Result<LaunchError, { campaignId: string }>> {
    const parsed = parseTweetUrl(input.tweetUrl)
    if (!parsed) return { ok: false, error: "invalid_tweet_url" }
    if (
      !input.keyword.trim() ||
      !isHttpUrl(input.leadMagnetUrl) ||
      !templatesAreValid(input.templates) ||
      !(input.durationHours > 0)
    ) {
      return { ok: false, error: "invalid_draft" }
    }

    const precheck = await this.withState((s): Result<LaunchError, { account: XAccount }> => {
      if (!s.tosAccepted) return { ok: false, error: "tos_not_accepted" }
      if (s.breaker) return { ok: false, error: "breaker_active" }
      if (activeCount(s.campaigns) >= MAX_ACTIVE_CAMPAIGNS) return { ok: false, error: "too_many_campaigns" }
      return { ok: true, account: s.account }
    })
    if (!precheck) return { ok: false, error: "x_not_connected" }
    if (!precheck.ok) return precheck
    const { account } = precheck

    let tweet
    try {
      tweet = await this.deps.x.getTweet(parsed.tweetId)
    } catch (error) {
      if (error instanceof XError && error.kind === "not_found") return { ok: false, error: "tweet_not_found" }
      await this.handleXError(error)
      return { ok: false, error: "x_unreachable" }
    }
    if (tweet.authorId !== account.id) return { ok: false, error: "not_your_tweet" }

    const now = this.deps.clock.now()
    const created = await this.withState((s): Result<LaunchError, { campaignId: string }> => {
      if (activeCount(s.campaigns) >= MAX_ACTIVE_CAMPAIGNS) return { ok: false, error: "too_many_campaigns" }
      const title = input.title?.trim().slice(0, MAX_TITLE_LENGTH)
      const campaign: Campaign = {
        id: this.deps.ids(),
        ...(title ? { title } : {}),
        sourceTweet: {
          id: tweet.id,
          url: input.tweetUrl.trim(),
          authorId: tweet.authorId,
          authorHandle: account.handle,
          text: tweet.text,
        },
        keyword: input.keyword.trim(),
        leadMagnetUrl: input.leadMagnetUrl.trim(),
        formerLinks: (input.formerLinks ?? []).map((l) => l.trim()).filter((l) => normalizeLink(l) !== null),
        templates: input.templates,
        mustFollow: input.mustFollow,
        durationHours: input.durationHours,
        createdAt: now,
        endsAt: now + input.durationHours * HOUR,
        status: "active",
        seenCommentIds: [],
      }
      s.campaigns.unshift(campaign)
      return { ok: true, campaignId: campaign.id }
    })
    if (!created) return { ok: false, error: "x_not_connected" }
    if (created.ok) await this.deps.scheduler.scheduleTick(now)
    return created
  }

  async pause(campaignId: string): Promise<void> {
    await this.withState((s) => {
      const campaign = s.campaigns.find((c) => c.id === campaignId)
      if (campaign?.status === "active") campaign.status = "paused"
      if (campaign) delete campaign.stoppedBy
    })
  }

  async resume(campaignId: string): Promise<Result<"too_many_campaigns" | "breaker_active" | "finished">> {
    const result = await this.withState((s): Result<"too_many_campaigns" | "breaker_active" | "finished"> => {
      const campaign = s.campaigns.find((c) => c.id === campaignId)
      if (!campaign || campaign.status === "finished") return { ok: false, error: "finished" }
      if (campaign.status === "active") return { ok: true }
      if (s.breaker) return { ok: false, error: "breaker_active" }
      if (activeCount(s.campaigns) >= MAX_ACTIVE_CAMPAIGNS) return { ok: false, error: "too_many_campaigns" }
      campaign.status = "active"
      delete campaign.stoppedBy
      return { ok: true }
    })
    if (result?.ok) await this.deps.scheduler.scheduleTick(this.deps.clock.now())
    return result ?? { ok: false, error: "finished" }
  }

  /**
   * Stops a Campaign for good and forgets its reviews and activity. Its Leads move to the archive so they can
   * still be exported; the Quota history stays: those Actions did happen on X.
   */
  async deleteCampaign(campaignId: string): Promise<void> {
    const now = this.deps.clock.now()
    await this.withState((s) => {
      const campaign = s.campaigns.find((c) => c.id === campaignId)
      const leads = s.leads.filter((l) => l.campaignId === campaignId)
      if (campaign && leads.length) (s.archive ??= []).push({ campaign, leads, deletedAt: now })
      s.campaigns = s.campaigns.filter((c) => c.id !== campaignId)
      s.leads = s.leads.filter((l) => l.campaignId !== campaignId)
      s.reviews = s.reviews.filter((r) => r.campaignId !== campaignId)
      s.activity = s.activity.filter((a) => a.campaignId !== campaignId)
      if (s.lastCampaignId === campaignId) delete s.lastCampaignId
    })
  }

  async approveReview(reviewId: string): Promise<void> {
    const now = this.deps.clock.now()
    const { volume } = await this.deps.config.get()
    const nextActionAt = await this.withState((s) => {
      const review = s.reviews.find((r) => r.id === reviewId)
      if (!review) return undefined
      s.reviews = s.reviews.filter((r) => r.id !== reviewId)
      if (!s.leads.some((l) => l.campaignId === review.campaignId && l.author.id === review.author.id)) {
        s.leads.push(
          this.withSkipAck(
            newLead({
              id: this.deps.ids(),
              campaignId: review.campaignId,
              author: review.author,
              comment: review.comment,
              matchedBy: "manual",
              probability: review.probability,
              at: now,
            }),
            volume.replyRate
          )
        )
      }
      return Math.max(now, s.tick.nextActionAt ?? now)
    })
    if (nextActionAt !== undefined && nextActionAt !== null) await this.deps.scheduler.scheduleAction(nextActionAt)
  }

  async rejectReview(reviewId: string): Promise<void> {
    await this.withState((s) => {
      s.reviews = s.reviews.filter((r) => r.id !== reviewId)
    })
  }

  async killSwitch(): Promise<void> {
    await this.withState((s) => this.trip(s, "kill_switch"))
  }

  async restart(): Promise<Result<"too_early">> {
    const now = this.deps.clock.now()
    const result = await this.withState((s): Result<"too_early"> => {
      if (!s.breaker) return { ok: true }
      if (s.breaker.reason === "x_restriction" && now < s.breaker.at + RESTRICTION_COOLDOWN) {
        return { ok: false, error: "too_early" }
      }
      this.reset(s)
      return { ok: true }
    })
    if (result?.ok) await this.deps.scheduler.scheduleTick(now)
    return result ?? { ok: true }
  }

  // ── Tick: scan new Comments, classify, enqueue ────────────────────────────

  async tick(): Promise<void> {
    const { clock, random, scheduler } = this.deps
    const now = clock.now()
    // Nothing running, stopped by the system or left in a finished queue: no X call, no next Tick until a launch.
    const status = await this.withState((s) => ({
      running: s.campaigns.some(
        (c) => c.status === "active" || c.stoppedBy || (c.status === "finished" && pendingCount(c, s.leads) > 0)
      ),
      quiet: s.tick.quietTicks ?? 0,
    }))
    if (!status?.running) return

    const config = await this.deps.config.get()
    const { pacing } = config

    // Night: a person does not check their post. Campaigns still end on time; the scan waits for the morning.
    if (!isAwake(now, pacing.activeHours)) {
      const wakeAt = nextWakeAt(now, pacing.activeHours, random)
      await this.withState((s) => {
        this.expire(s, now)
        s.tick.nextTickAt = wakeAt
        s.tick.rest = { reason: "night", until: wakeAt }
      })
      await scheduler.scheduleTick(wakeAt)
      return
    }

    // A post that stopped getting Comments is looked at less often.
    const cadence = status.quiet >= pacing.quietTicks ? pacing.quietTickMinutes : pacing.tickMinutes
    const nextTickAt = now + between(random, cadence[0], cadence[1]) * MINUTE
    await scheduler.scheduleTick(nextTickAt)

    let account: XAccount | null = null
    try {
      account = await this.deps.x.whoami()
    } catch (error) {
      await this.handleXError(error)
      return
    }
    await this.useAccount(account)

    const plan = await this.withState((s) => {
      s.tick.lastTickAt = now
      s.tick.nextTickAt = nextTickAt
      if (s.tick.rest?.reason === "night") delete s.tick.rest
      if (s.breaker?.reason === "session_expired") this.reset(s)
      this.expire(s, now)
      if (s.breaker) return []

      const active = s.campaigns.filter((c) => c.status === "active")
      if (active.length) s.tick.phase = "scanning"
      return active.map((c) => ({
        id: c.id,
        tweetId: c.sourceTweet.id,
        keyword: c.keyword,
        seen: new Set(c.seenCommentIds),
        known: new Set([
          ...s.leads.filter((l) => l.campaignId === c.id).map((l) => l.author.id),
          ...s.reviews.filter((r) => r.campaignId === c.id).map((r) => r.author.id),
        ]),
      }))
    })
    if (!plan) return

    const thresholds = config.thresholds
    const found: { campaignId: string; leads: Lead[]; reviews: PendingReview[]; seen: string[] }[] = []
    for (const campaign of plan) {
      let replies: Reply[]
      try {
        replies = await this.deps.x.listReplies(campaign.tweetId, campaign.seen)
      } catch (error) {
        if (await this.handleXError(error)) break
        continue
      }

      const leads: Lead[] = []
      const reviews: PendingReview[] = []
      const seen: string[] = []
      const toClassify: Reply[] = []
      for (const reply of replies) {
        if (reply.inReplyToId !== campaign.tweetId || reply.author.id === account.id || campaign.seen.has(reply.id)) continue
        if (campaign.known.has(reply.author.id)) {
          seen.push(reply.id)
          continue
        }
        if (matchesKeyword(reply.text, campaign.keyword)) {
          campaign.known.add(reply.author.id)
          seen.push(reply.id)
          leads.push(this.lead(campaign.id, reply, "exact", now, config.volume.replyRate))
        } else {
          toClassify.push(reply)
        }
      }

      if (toClassify.length) {
        await this.withState((s) => {
          s.tick.phase = "classifying"
          s.tick.pending = toClassify.length
        })
      }
      for (let i = 0; i < toClassify.length; i += MAX_CLASSIFY_BATCH) {
        const batch = toClassify.slice(i, i + MAX_CLASSIFY_BATCH)
        let results: { id: string; probability: number }[]
        try {
          results = await this.deps.classifier.classify(
            campaign.keyword,
            batch.map((r) => ({ id: r.id, text: r.text }))
          )
        } catch (error) {
          if (error instanceof ClassifierUnavailable) break
          throw error
        }
        const probabilities = new Map(results.map((r) => [r.id, r.probability]))
        for (const reply of batch) {
          const probability = probabilities.get(reply.id)
          if (probability === undefined) continue
          seen.push(reply.id)
          if (campaign.known.has(reply.author.id)) continue
          const decision = decide(probability, thresholds)
          if (decision === "reject") continue
          campaign.known.add(reply.author.id)
          if (decision === "accept") {
            leads.push(this.lead(campaign.id, reply, "classified", now, config.volume.replyRate, probability))
          } else {
            reviews.push({
              id: this.deps.ids(),
              campaignId: campaign.id,
              author: reply.author,
              comment: { id: reply.id, text: reply.text },
              probability,
              at: now,
            })
          }
        }
      }
      found.push({ campaignId: campaign.id, leads, reviews, seen })
    }

    // New Comments take a moment to be noticed: the first Action on them is never immediate.
    const newLeads = found.some((f) => f.leads.length > 0)
    const noticedAt = clock.now() + (newLeads ? skewedBetween(random, pacing.reactionSeconds) * SECOND : 0)
    const nextActionAt = await this.withState((s) => {
      let fresh = 0
      for (const result of found) {
        const campaign = s.campaigns.find((c) => c.id === result.campaignId)
        if (!campaign) continue
        const known = new Set(s.leads.filter((l) => l.campaignId === campaign.id).map((l) => l.author.id))
        s.leads.push(...result.leads.filter((l) => !known.has(l.author.id)))
        s.reviews.push(...result.reviews)
        campaign.seenCommentIds.push(...result.seen)
        campaign.lastScanAt = now
        fresh += result.seen.length
      }
      s.tick.quietTicks = fresh > 0 ? 0 : (s.tick.quietTicks ?? 0) + 1
      s.tick.phase = "idle"
      s.tick.pending = 0
      if (s.breaker) return null
      return Math.max(noticedAt, s.tick.nextActionAt ?? 0)
    })
    if (typeof nextActionAt === "number") await scheduler.scheduleAction(nextActionAt)
  }

  // ── Act: handle the next Lead, one sitting at a time ─────────────────────

  /**
   * Takes the next Lead of the ActionQueue and does what a person would do on that comment in one go:
   * DM, then like, then reply, a few seconds apart. Between two Leads the delay is skewed short; after a
   * burst of Actions comes a break; at night nothing happens at all (ADR 0011).
   */
  async act(): Promise<ActOutcome> {
    const { clock, random, scheduler, wait } = this.deps
    const now = clock.now()
    const config = await this.deps.config.get()
    const { pacing } = config

    const planned = await this.withState((s) => {
      if (s.breaker) return { type: "blocked" as const }
      if (s.tick.rest && now >= s.tick.rest.until) delete s.tick.rest
      if (s.tick.nextActionAt && now < s.tick.nextActionAt) return { type: "wait" as const, at: s.tick.nextActionAt }
      const next = this.pick(s, config, now)
      if (!next) return { type: "idle" as const }
      if (!isAwake(now, pacing.activeHours)) {
        const wakeAt = nextWakeAt(now, pacing.activeHours, random)
        s.tick.rest = { reason: "night", until: wakeAt }
        s.tick.nextActionAt = wakeAt
        return { type: "wait" as const, at: wakeAt }
      }
      s.tick.phase = "acting"
      return { type: "act" as const, ...next }
    })
    if (!planned || planned.type === "blocked") return "blocked"
    if (planned.type === "idle") return "idle"
    if (planned.type === "wait") {
      await scheduler.scheduleAction(planned.at)
      return "waiting"
    }

    let { step, lead, campaign, delivered, lastVariants } = planned
    let steps = 0
    for (;;) {
      const { outcome, variant } = delivered
        ? { outcome: { kind: "dm_already_sent" as const } }
        : await this.execute(step, lead, campaign, config, lastVariants)
      if (outcome.kind === "error" && (await this.handleXError(outcome.error))) return "blocked"
      steps++

      const at = clock.now()
      const followUp = await this.withState((s) => {
        const current = s.leads.find((l) => l.id === lead.id)
        if (current) this.apply(s, current, step, outcome, at)
        if (variant && outcome.kind !== "error") (s.tick.lastVariants ??= {})[variant.family] = variant.index
        s.lastCampaignId = campaign.id
        // Still on that comment: the next step on the same Lead follows in a few seconds.
        if (!current || outcome.kind === "error" || steps >= MAX_CHAIN) return null
        return this.pick(s, config, at, current)
      })
      if (!followUp) break
      await wait(skewedBetween(random, pacing.followUpDelaySeconds) * SECOND)
      ;({ step, lead, campaign, delivered, lastVariants } = followUp)
    }

    const nextActionAt = await this.withState((s) => {
      const burst = (s.tick.burst ??= { done: 0, size: between(random, pacing.burstActions[0], pacing.burstActions[1]) })
      burst.done += steps
      let delay = skewedBetween(random, pacing.actionDelaySeconds) * SECOND
      if (burst.done >= burst.size) {
        delay = skewedBetween(random, pacing.breakMinutes) * MINUTE
        s.tick.burst = { done: 0, size: between(random, pacing.burstActions[0], pacing.burstActions[1]) }
        s.tick.rest = { reason: "break", until: clock.now() + delay }
      }
      s.tick.phase = "idle"
      s.tick.nextActionAt = clock.now() + delay
      return s.tick.nextActionAt
    })
    if (nextActionAt) await scheduler.scheduleAction(nextActionAt)
    return "done"
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  /**
   * Today's limits: the tier's, scaled down during the first days, and for DMs and replies by a target
   * drawn once a day so the account does not stop on the same number every evening.
   */
  private limits(s: EngineState, config: Config, now: number): QuotaLimits {
    const day = localDay(now)
    if (s.tick.dailyTarget?.day !== day) {
      const [min, max] = config.volume.dailyTarget
      s.tick.dailyTarget = { day, factor: min + this.deps.random() * (max - min) }
    }
    const ramp = rampFraction(s.firstActionAt, now, config.volume.rampUp)
    return effectiveLimits(config.limits[s.account.tier], ramp, s.tick.dailyTarget.factor)
  }

  private allowed(s: EngineState, config: Config, now: number) {
    const limits = this.limits(s, config, now)
    return (kind: Step["kind"]) =>
      kind === "dm" && config.x.dmMode === "public_reply" ? true : hasQuota(kind, s.history, now, limits)
  }

  /** Most delivered Leads get the public "sent" reply; a person does not answer every single comment. */
  private withSkipAck(lead: Lead, replyRate: number): Lead {
    return this.deps.random() >= replyRate ? { ...lead, skipAck: true } : lead
  }

  /**
   * The next step to run, with a copy of its Lead and Campaign: for `lead`, the following step on that same
   * Lead (its Campaign must still be active); otherwise the head of the ActionQueue.
   */
  private pick(s: EngineState, config: Config, now: number, lead?: Lead) {
    s.history = pruneHistory(s.history, now)
    const allowed = this.allowed(s, config, now)
    let next: { leadId: string; campaignId: string; step: Step } | null
    if (lead) {
      const campaign = s.campaigns.find((c) => c.id === lead.campaignId)
      const step = campaign && isServed(campaign) ? nextStep(lead, campaign.lastScanAt ?? 0) : null
      next = step && allowed(step.kind) ? { leadId: lead.id, campaignId: lead.campaignId, step } : null
    } else {
      next = pickNextAction({ campaigns: s.campaigns, leads: s.leads, lastCampaignId: s.lastCampaignId, allowed })
    }
    if (!next) return null
    const current = s.leads.find((l) => l.id === next.leadId)!
    const campaign = s.campaigns.find((c) => c.id === next.campaignId)!
    return {
      step: next.step,
      lead: structuredClone(current),
      campaign: structuredClone(campaign),
      delivered: next.step.kind === "dm" && this.alreadyDelivered(s, current, campaign),
      lastVariants: { ...s.tick.lastVariants },
    }
  }

  private expire(s: EngineState, now: number) {
    for (const campaign of s.campaigns) {
      if (campaign.status !== "finished" && isExpired(campaign, now)) {
        campaign.status = "finished"
        delete campaign.stoppedBy
      }
    }
  }

  private async execute(
    step: Step,
    lead: Lead,
    campaign: Campaign,
    config: Config,
    lastVariants: Partial<Record<TemplateFamily, number>>
  ): Promise<{ outcome: Outcome; variant?: { family: TemplateFamily; index: number } }> {
    const { x, random } = this.deps
    const to = lead.author
    let variant: { family: TemplateFamily; index: number } | undefined
    const text = (family: TemplateFamily) => {
      const variants = campaign.templates[family]
      const index = pickVariantIndex(variants, random, lastVariants[family])
      variant = { family, index }
      return renderTemplate(variants[index]!, to)
    }
    const delivery = () => `${text("dm")}\n${campaign.leadMagnetUrl}`
    const done = (outcome: Outcome) => (variant ? { outcome, variant } : { outcome })
    try {
      switch (step.kind) {
        case "like":
          await x.like(lead.comment.id)
          return done({ kind: "liked" })
        case "dm": {
          if (config.x.dmMode === "public_reply") return done({ kind: "dm_sent", viaReply: true })
          // XChat says itself when DMs are closed; the legacy permission only matters for the legacy endpoint.
          const legacy = config.x.dmMode === "api"
          if (legacy || campaign.mustFollow) {
            const relationship = await x.relationship(to.id)
            if ((legacy && !relationship.canDm) || (campaign.mustFollow && !relationship.followsMe)) {
              return done({ kind: "dm_closed" })
            }
          }
          const sent = await x.sendDm(to.id, delivery(), campaignLinks(campaign))
          return done(sent === "already_sent" ? { kind: "dm_already_sent" } : { kind: "dm_sent", viaReply: false })
        }
        case "reply": {
          const viaReply = config.x.dmMode === "public_reply" && step.ack === "sent"
          await x.reply(lead.comment.id, viaReply ? delivery() : text(step.ack === "sent" ? "ackSent" : "ackDmClosed"))
          return done({ kind: "replied", ack: step.ack })
        }
      }
    } catch (error) {
      if (!(error instanceof XError)) return { outcome: { kind: "error", error: new XError("transient", "unknown", String(error)) } }
      if (error.kind === "dm_closed" && step.kind === "dm") return { outcome: { kind: "dm_closed" } }
      if (error.kind === "not_found") return { outcome: { kind: "gone", step } }
      return { outcome: { kind: "error", error } }
    }
  }

  private apply(s: EngineState, lead: Lead, step: Step, outcome: Outcome, now: number) {
    const log = (kind: ActivityKind) => {
      s.activity.push({ campaignId: lead.campaignId, handle: lead.author.handle, kind, at: now })
      const mine = s.activity.filter((a) => a.campaignId === lead.campaignId)
      if (mine.length > ACTIVITY_PER_CAMPAIGN) {
        const drop = mine[0]
        s.activity = s.activity.filter((a) => a !== drop)
      }
    }
    if (outcome.kind !== "error") delete lead.errors

    switch (outcome.kind) {
      case "liked":
        lead.liked = true
        s.firstActionAt ??= now
        s.history.push({ kind: "like", at: now })
        log("like")
        return
      case "dm_sent":
        lead.delivery = "sent"
        lead.deliveredAt = now
        if (!outcome.viaReply) {
          lead.dmAttempts += 1
          lead.lastDmAttemptAt = now
          s.firstActionAt ??= now
          s.history.push({ kind: "dm", at: now })
          s.tick.lastDmAt = now
          log("dm")
        }
        return
      case "dm_already_sent":
        lead.delivery = "sent"
        lead.alreadySent = true
        lead.deliveredAt = now
        log("dm_already_sent")
        return
      case "dm_closed":
        lead.delivery = "dm_closed"
        lead.dmAttempts += 1
        lead.lastDmAttemptAt = now
        log("dm_closed")
        return
      case "replied":
        lead.ack = outcome.ack
        s.firstActionAt ??= now
        s.history.push({ kind: "reply", at: now })
        log(outcome.ack === "sent" ? "reply_sent" : "reply_dm_closed")
        return
      case "gone":
        // The Comment or the person is gone: skip what can be skipped, fail the DM.
        if (outcome.step.kind === "like") lead.liked = true
        else if (outcome.step.kind === "reply") lead.ack = outcome.step.ack
        else {
          lead.delivery = "failed"
          lead.failure = "not_found"
          log("failed")
        }
        return
      case "error":
        if (outcome.error.kind !== "transient") return
        lead.errors = (lead.errors ?? 0) + 1
        if (lead.errors >= MAX_TRANSIENT_ERRORS && step.kind !== "reply") {
          lead.delivery = "failed"
          lead.failure = outcome.error.code
          log("failed")
        } else if (lead.errors >= MAX_TRANSIENT_ERRORS) {
          lead.ack = step.kind === "reply" ? step.ack : lead.ack
          delete lead.errors
        }
        return
    }
  }

  private lead(
    campaignId: string,
    reply: Reply,
    matchedBy: "exact" | "classified",
    at: number,
    replyRate: number,
    probability?: number
  ): Lead {
    return this.withSkipAck(
      newLead({
      id: this.deps.ids(),
      campaignId,
      author: reply.author,
      comment: { id: reply.id, text: reply.text },
        matchedBy,
        ...(probability === undefined ? {} : { probability }),
        at,
      }),
      replyRate
    )
  }

  /**
   * The link was already sent to this person by the extension, for a Campaign with the same lead magnet:
   * it is in the DMs, no need to open them. Another lead magnet is always checked in the DMs.
   */
  private alreadyDelivered(s: EngineState, lead: Lead, campaign: Campaign): boolean {
    const links = new Set(campaignLinks(campaign))
    return s.leads.some((other) => {
      if (other.id === lead.id || other.author.id !== lead.author.id || other.delivery !== "sent") return false
      const source = s.campaigns.find((c) => c.id === other.campaignId)
      return source !== undefined && campaignLinks(source).some((l) => links.has(l))
    })
  }

  /** Trips the CircuitBreaker on restriction, lost session or an unusable XChat. Returns true when it did. */
  private async handleXError(error: unknown): Promise<boolean> {
    if (!(error instanceof XError)) return false
    const reasons: Partial<Record<XError["kind"], BreakerReason>> = {
      restriction: "x_restriction",
      session_expired: "session_expired",
      xchat_locked: "xchat_locked",
      xchat_unavailable: "xchat_unavailable",
    }
    const reason = reasons[error.kind]
    if (!reason) return false
    await this.withState((s) => this.trip(s, reason, error.code))
    return true
  }

  private trip(s: EngineState, reason: BreakerReason, code?: string) {
    if (s.breaker && !(reason === "x_restriction" && s.breaker.reason !== "x_restriction")) return
    s.breaker = { reason, ...(code ? { code } : {}), at: this.deps.clock.now() }
    s.tick.phase = "idle"
    for (const campaign of s.campaigns) {
      if (campaign.status === "active") {
        campaign.status = "paused"
        campaign.stoppedBy = "breaker"
      }
    }
  }

  private reset(s: EngineState) {
    s.breaker = null
    for (const campaign of s.campaigns) {
      if (campaign.stoppedBy === "breaker") {
        campaign.status = "active"
        delete campaign.stoppedBy
      }
    }
  }

  private async useAccount(account: XAccount) {
    await this.exclusive(async () => {
      const state = await this.deps.store.load(account.id)
      state.account = account
      await this.deps.store.save(state)
    })
  }

  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn)
    this.queue = run.catch(() => undefined)
    return run
  }

  /** Loads the current account's state, mutates it, saves it. null when no X account was ever connected. */
  private withState<T>(fn: (s: EngineState) => T): Promise<T | null> {
    return this.exclusive(async () => {
      const id = await this.deps.store.currentAccountId()
      if (!id) return null
      const state = await this.deps.store.load(id)
      const result = fn(state)
      await this.deps.store.save(state)
      return result
    })
  }
}
