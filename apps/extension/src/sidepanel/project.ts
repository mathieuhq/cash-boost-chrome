import type { ActivityEntry, ActivityKind, EngineState } from "@super-x/application"
import type { Entitlement, RemoteConfig } from "@super-x/contracts"
import { pendingCount, quotaUsage, type Campaign, type Lead } from "@super-x/domain"

import { clock } from "~lib/format"

import type { ActionLogItem, CampaignView, PanelState } from "./model"

const ACTIVITY: Record<ActivityKind, { label: string; state: ActionLogItem["state"] }> = {
  like: { label: "Like", state: "done" },
  dm: { label: "DM envoyé", state: "done" },
  dm_already_sent: { label: "Lien déjà en DM", state: "done" },
  dm_closed: { label: "DM fermé", state: "waiting" },
  reply_sent: { label: "Réponse publique", state: "done" },
  reply_dm_closed: { label: "Réponse « ouvre tes DMs »", state: "done" },
  failed: { label: "Échec", state: "failed" },
}

const TITLE_LENGTH = 48

export function campaignTitle(campaign: Campaign): string {
  const firstLine = campaign.sourceTweet.text?.split("\n").find((line) => line.trim())?.trim()
  if (!firstLine) return `Campagne ${campaign.keyword}`
  return firstLine.length > TITLE_LENGTH ? `${firstLine.slice(0, TITLE_LENGTH - 1).trimEnd()}…` : firstLine
}

const leadAt = (lead: Lead) => lead.deliveredAt ?? lead.createdAt

function log(activity: ActivityEntry[], campaignId: string): ActionLogItem[] {
  return activity
    .filter((a) => a.campaignId === campaignId)
    .map((a) => ({ label: `${ACTIVITY[a.kind].label} · @${a.handle}`, time: clock(a.at), state: ACTIVITY[a.kind].state }))
}

/** What the side panel shows, derived from the engine's persisted state. */
export function project(state: EngineState, input: { entitlement: Entitlement | null; config: RemoteConfig; now: number }): PanelState {
  const { config, now } = input
  const campaigns: CampaignView[] = state.campaigns.map((c) => {
    const leads = state.leads.filter((l) => l.campaignId === c.id)
    return {
      id: c.id,
      title: campaignTitle(c),
      tweetUrl: c.sourceTweet.url,
      ...(c.sourceTweet.text ? { tweetText: c.sourceTweet.text } : {}),
      keyword: c.keyword,
      leadMagnetUrl: c.leadMagnetUrl,
      status: c.status,
      leads: leads.length,
      sent: leads.filter((l) => l.delivery === "sent").length,
      queued: pendingCount(c, state.leads),
      endsAt: c.endsAt,
      log: log(state.activity, c.id),
      ...(c.stoppedBy ? { stoppedBy: c.stoppedBy } : {}),
    }
  })

  const titles = new Map(campaigns.map((c) => [c.id, c.title]))
  const usage = quotaUsage(state.history, now, config.limits[state.account.tier])
  const entitlement: Entitlement = input.entitlement ?? { kind: "none", trialAvailable: false }

  return {
    account: { handle: state.account.handle, name: state.account.name },
    entitlement: {
      kind: entitlement.kind,
      trialAvailable: entitlement.trialAvailable,
      ...(entitlement.trialEndsAt === undefined ? {} : { trialEndsAt: entitlement.trialEndsAt }),
    },
    tosAccepted: state.tosAccepted,
    breaker: state.breaker
      ? { reason: state.breaker.reason, at: state.breaker.at, ...(state.breaker.code ? { code: state.breaker.code } : {}) }
      : null,
    campaigns,
    reviews: state.reviews.map((r) => ({
      id: r.id,
      campaignId: r.campaignId,
      name: r.author.name,
      handle: r.author.handle,
      comment: r.comment.text,
      probability: r.probability,
    })),
    leads: [
      ...state.leads.map((lead) => ({ lead, campaign: titles.get(lead.campaignId) ?? "" })),
      ...(state.archive ?? []).flatMap((a) => a.leads.map((lead) => ({ lead, campaign: campaignTitle(a.campaign), archived: true as const }))),
    ]
      .sort((a, b) => leadAt(b.lead) - leadAt(a.lead))
      .map(({ lead: l, ...origin }) => ({
        id: l.id,
        campaignId: l.campaignId,
        ...origin,
        name: l.author.name,
        handle: l.author.handle,
        ...(l.author.avatar ? { avatar: l.author.avatar } : {}),
        comment: l.comment.text,
        status: l.delivery,
        at: leadAt(l),
      })),
    quotas: { tier: state.account.tier, dms: usage.dm, likes: usage.like, replies: usage.reply },
    tick: {
      phase: state.tick.phase,
      pending: state.tick.pending || campaigns.reduce((sum, c) => sum + (c.status === "active" ? c.queued : 0), 0),
      nextAt: Math.max(now, state.tick.nextTickAt ?? now),
      ...(state.tick.lastDmAt ? { lastDmAt: state.tick.lastDmAt } : {}),
    },
  }
}
