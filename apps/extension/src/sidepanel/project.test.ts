import { DEFAULT_CONFIG, emptyState } from "@super-x/application"
import { newLead, type Campaign } from "@super-x/domain"
import { describe, expect, it } from "vitest"

import { campaignTitle, project } from "./project"

const now = Date.UTC(2026, 9, 11, 12)

const campaign = (patch: Partial<Campaign> = {}): Campaign => ({
  id: "c1",
  sourceTweet: { id: "1", url: "https://x.com/me/status/1", authorId: "100", authorHandle: "me", text: "J'offre mon template Notion.\nCommente GUIDE" },
  keyword: "GUIDE",
  leadMagnetUrl: "https://notion.so",
  templates: { dm: [], ackSent: [], ackDmClosed: [] },
  mustFollow: false,
  durationHours: 48,
  createdAt: now,
  endsAt: now + 48 * 3_600_000,
  status: "active",
  seenCommentIds: [],
  lastScanAt: now,
  ...patch,
})

const lead = (id: string, patch = {}) => ({
  ...newLead({ id, campaignId: "c1", author: { id, handle: `h${id}`, name: `N${id}` }, comment: { id: `t${id}`, text: "GUIDE" }, matchedBy: "exact", at: now }),
  ...patch,
})

describe("campaignTitle", () => {
  it("uses the tweet's first line", () => {
    expect(campaignTitle(campaign())).toBe("J'offre mon template Notion.")
  })

  it("prefers the title chosen by the user", () => {
    expect(campaignTitle(campaign({ title: "  Template Notion  " }))).toBe("Template Notion")
  })

  it("falls back to the Keyword", () => {
    expect(campaignTitle(campaign({ sourceTweet: { ...campaign().sourceTweet, text: "" } }))).toBe("Campagne GUIDE")
  })
})

describe("project", () => {
  it("counts Leads, DMs sent and Leads still in the queue", () => {
    const state = emptyState({ id: "100", handle: "me", name: "Moi", tier: "free" })
    state.campaigns = [campaign()]
    state.leads = [lead("1", { liked: true, delivery: "sent", ack: "sent", deliveredAt: now }), lead("2")]
    state.history = [{ kind: "dm", at: now - 1000 }]
    state.activity = [{ campaignId: "c1", handle: "h1", kind: "dm", at: now }]

    const view = project(state, { config: DEFAULT_CONFIG, now })
    expect(view.campaigns[0]).toMatchObject({ leads: 2, sent: 1, queued: 1, log: [{ label: "DM envoyé · @h1", state: "done" }] })
    expect(view.quotas.dms).toEqual({ used: 1, limit: 20 })
    expect(view.leads.map((l) => l.status)).toEqual(["sent", "queued"])
  })

  it("keeps the Leads of deleted Campaigns, with their Campaign title, for the export", () => {
    const state = emptyState({ id: "100", handle: "me", name: "Moi", tier: "free" })
    state.archive = [{ campaign: campaign({ id: "old" }), leads: [lead("9", { campaignId: "old", delivery: "sent", deliveredAt: now })], deletedAt: now }]

    const view = project(state, { config: DEFAULT_CONFIG, now })
    expect(view.campaigns).toEqual([])
    expect(view.leads).toEqual([expect.objectContaining({ handle: "h9", campaign: "J'offre mon template Notion.", archived: true })])
  })

  it("shows a rest only while it lasts", () => {
    const state = emptyState({ id: "100", handle: "me", name: "Moi", tier: "free" })
    state.tick.rest = { reason: "night", until: now + 60_000 }
    expect(project(state, { config: DEFAULT_CONFIG, now }).tick.rest).toEqual({ reason: "night", until: now + 60_000 })
    expect(project(state, { config: DEFAULT_CONFIG, now: now + 60_000 }).tick).not.toHaveProperty("rest")
  })

  it("reads states saved before the archive existed", () => {
    const state = emptyState({ id: "100", handle: "me", name: "Moi", tier: "free" })
    delete state.archive
    expect(project(state, { config: DEFAULT_CONFIG, now }).leads).toEqual([])
  })
})
