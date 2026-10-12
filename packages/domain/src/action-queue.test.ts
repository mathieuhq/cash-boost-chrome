import { describe, expect, it } from "vitest"

import type { Campaign } from "./campaign"
import { newLead, type Lead } from "./lead"
import { pickNextAction } from "./action-queue"

const campaign = (id: string, patch: Partial<Campaign> = {}): Campaign => ({
  id,
  sourceTweet: { id: `t-${id}`, url: "", authorId: "me", authorHandle: "me" },
  keyword: "GUIDE",
  leadMagnetUrl: "https://example.com",
  templates: { dm: [], ackSent: [], ackDmClosed: [] },
  mustFollow: false,
  durationHours: 48,
  createdAt: 0,
  endsAt: 1e12,
  status: "active",
  seenCommentIds: [],
  lastScanAt: 0,
  ...patch,
})

const lead = (id: string, campaignId: string, at: number, patch: Partial<Lead> = {}): Lead => ({
  ...newLead({
    id,
    campaignId,
    author: { id: `u-${id}`, handle: id, name: id },
    comment: { id: `c-${id}`, text: "GUIDE" },
    matchedBy: "exact",
    at,
  }),
  ...patch,
})

const always = () => true

describe("pickNextAction (ActionQueue)", () => {
  it("serves campaigns in turn, oldest lead first", () => {
    const campaigns = [campaign("a"), campaign("b")]
    const leads = [lead("a2", "a", 2), lead("a1", "a", 1), lead("b1", "b", 3)]
    expect(pickNextAction({ campaigns, leads, lastCampaignId: undefined, allowed: always })).toMatchObject({ leadId: "a1" })
    expect(pickNextAction({ campaigns, leads, lastCampaignId: "a", allowed: always })).toMatchObject({ leadId: "b1" })
    expect(pickNextAction({ campaigns, leads, lastCampaignId: "b", allowed: always })).toMatchObject({ leadId: "a1" })
  })

  it("skips paused and finished campaigns", () => {
    const campaigns = [campaign("a", { status: "paused" }), campaign("b", { status: "finished" })]
    const leads = [lead("a1", "a", 1), lead("b1", "b", 1)]
    expect(pickNextAction({ campaigns, leads, lastCampaignId: undefined, allowed: always })).toBeNull()
  })

  it("lets a lead whose step has Quota go before one that waits", () => {
    const campaigns = [campaign("a")]
    const leads = [lead("a1", "a", 1), lead("a2", "a", 2, { delivery: "sent" })]
    const next = pickNextAction({ campaigns, leads, lastCampaignId: undefined, allowed: (kind) => kind !== "dm" })
    expect(next).toEqual({ campaignId: "a", leadId: "a2", step: { kind: "like" } })
  })

  it("retries closed DMs only after the campaign's last scan", () => {
    const campaigns = [campaign("a", { lastScanAt: 100 })]
    const closed = { liked: true, delivery: "dm_closed", ack: "dm_closed" } as const
    const leads = [lead("a1", "a", 1, { ...closed, lastDmAttemptAt: 150 }), lead("a2", "a", 2, { ...closed, lastDmAttemptAt: 50 })]
    expect(pickNextAction({ campaigns, leads, lastCampaignId: undefined, allowed: always })).toMatchObject({ leadId: "a2" })
  })
})
