import type { ActionRecord, Campaign, Lead, XUser } from "@super-x/domain"

import type { XAccount } from "./ports"

export type BreakerReason =
  | "kill_switch"
  | "x_restriction"
  | "session_expired"
  | "xchat_locked"
  | "xchat_unavailable"

export interface CircuitBreaker {
  reason: BreakerReason
  code?: string
  at: number
}

/** Comment whose Jev probability is in the grey zone; waits for a manual decision. */
export interface PendingReview {
  id: string
  campaignId: string
  author: XUser
  comment: { id: string; text: string }
  probability: number
  at: number
}

export type ActivityKind = "like" | "dm" | "dm_already_sent" | "dm_closed" | "reply_sent" | "reply_dm_closed" | "failed"

/** Recent Actions per Campaign, for the panel's live log. */
export interface ActivityEntry {
  campaignId: string
  handle: string
  kind: ActivityKind
  at: number
}

export const ACTIVITY_PER_CAMPAIGN = 5

/** A deleted Campaign, frozen with its Leads so they can still be exported. The engine never acts on them. */
export interface ArchivedCampaign {
  campaign: Campaign
  leads: Lead[]
  deletedAt: number
}

export type TickPhase = "idle" | "scanning" | "classifying" | "acting"

export interface TickState {
  phase: TickPhase
  /** Comments being classified or Actions waiting, for the panel's live sentence. */
  pending: number
  lastTickAt?: number
  nextTickAt?: number
  nextActionAt?: number
  lastDmAt?: number
}

/** Everything the engine knows about one X account, persisted in chrome.storage.local. */
export interface EngineState {
  schema: 1
  account: XAccount
  tosAccepted: boolean
  breaker: CircuitBreaker | null
  campaigns: Campaign[]
  leads: Lead[]
  reviews: PendingReview[]
  history: ActionRecord[]
  activity: ActivityEntry[]
  /** Absent in states saved before deletions were archived. */
  archive?: ArchivedCampaign[]
  lastCampaignId?: string
  tick: TickState
}

export function emptyState(account: XAccount): EngineState {
  return {
    schema: 1,
    account,
    tosAccepted: false,
    breaker: null,
    campaigns: [],
    leads: [],
    reviews: [],
    history: [],
    activity: [],
    archive: [],
    tick: { phase: "idle", pending: 0 },
  }
}
