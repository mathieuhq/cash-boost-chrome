// View model of the side panel, projected from the engine's state (project.ts). Terms follow CONTEXT.md.

export type CampaignStatus = "active" | "paused" | "finished"
export type DeliveryStatus = "queued" | "sent" | "dm_closed" | "failed"
export type ActionState = "done" | "current" | "queued" | "waiting" | "failed"

export interface ActionLogItem {
  label: string
  time?: string
  state: ActionState
}

export interface MessageTemplates {
  dm: string[]
  ackSent: string[]
  ackDmClosed: string[]
}

export interface CampaignView {
  id: string
  title: string
  tweetUrl: string
  keyword: string
  leadMagnetUrl: string
  status: CampaignStatus
  leads: number
  sent: number
  queued: number
  endsAt: number
  log: ActionLogItem[]
  /** Paused by the CircuitBreaker, not by the user. */
  stoppedBy?: "breaker"
}

export interface PendingReviewView {
  id: string
  campaignId: string
  name: string
  handle: string
  comment: string
  probability: number
}

export interface LeadView {
  id: string
  campaignId: string
  /** Campaign title, kept for Leads of a deleted Campaign. */
  campaign: string
  /** The Campaign was deleted; the Lead stays for the export. */
  archived?: true
  name: string
  handle: string
  avatar?: string
  comment: string
  status: DeliveryStatus
  at: number
}

export interface QuotaView {
  used: number
  limit: number
}

export interface Quotas {
  tier: "free" | "premium"
  dms: QuotaView
  likes: QuotaView
  replies: QuotaView
  /** The first days run on reduced limits; absent once the account is at full speed. */
  rampUp?: { day: number; days: number }
}

export interface CircuitBreakerView {
  reason: "kill_switch" | "x_restriction" | "session_expired" | "xchat_locked" | "xchat_unavailable"
  code?: string
  /** When the breaker tripped (epoch ms). */
  at: number
}

export interface TickView {
  phase: "idle" | "scanning" | "classifying" | "acting"
  /** The engine waits on purpose: the account sleeps at night, or pauses between two bursts of Actions. */
  rest?: { reason: "night" | "break"; until: number }
  pending: number
  nextAt: number
  lastDmAt?: number
}

/** Set once in the Options tab, applied to every new Campaign. */
/** Local hours between which the engine works, 0–23; `start === end` means all day. */
export interface ActiveHoursChoice {
  start: number
  end: number
}

export interface CampaignDefaults {
  templates: MessageTemplates
  mustFollow: boolean
  durationHours: number
}

export interface CampaignDraft {
  title: string
  tweetUrl: string
  keyword: string
  leadMagnetUrl: string
  /** Earlier links to the same lead magnet, one per line in the form. */
  formerLinks: string[]
  templates: MessageTemplates
  mustFollow: boolean
  durationHours: number
}

export interface PanelState {
  account: { handle: string; name: string; avatar?: string }
  tosAccepted: boolean
  breaker: CircuitBreakerView | null
  campaigns: CampaignView[]
  reviews: PendingReviewView[]
  leads: LeadView[]
  quotas: Quotas
  tick: TickView
}

export const MAX_ACTIVE_CAMPAIGNS = 3
