import { isServed, type Campaign } from "./campaign"
import { nextStep, type Lead, type Step } from "./lead"
import type { ActionKind } from "./quota"

export interface NextAction {
  campaignId: string
  leadId: string
  step: Step
}

/**
 * ActionQueue: round-robin between served Campaigns (starting after the last one served),
 * oldest Lead first within a Campaign, skipping steps whose Quota is exhausted.
 */
export function pickNextAction(input: {
  campaigns: readonly Campaign[]
  leads: readonly Lead[]
  lastCampaignId: string | undefined
  allowed: (kind: ActionKind) => boolean
}): NextAction | null {
  const active = input.campaigns.filter(isServed)
  if (active.length === 0) return null
  const start = active.findIndex((c) => c.id === input.lastCampaignId) + 1

  for (let i = 0; i < active.length; i++) {
    const campaign = active[(start + i) % active.length]!
    const queue = input.leads
      .filter((l) => l.campaignId === campaign.id)
      .sort((a, b) => a.createdAt - b.createdAt)
    for (const lead of queue) {
      const step = nextStep(lead, campaign.lastScanAt ?? 0)
      if (step && input.allowed(step.kind)) return { campaignId: campaign.id, leadId: lead.id, step }
    }
  }
  return null
}

/** Leads still waiting for at least one Action (shown as "en file"). */
export function pendingCount(campaign: Campaign, leads: readonly Lead[]): number {
  return leads.filter((l) => l.campaignId === campaign.id && nextStep(l, campaign.lastScanAt ?? 0) !== null).length
}
