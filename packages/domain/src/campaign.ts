import type { MessageTemplates } from "./template"

export type CampaignStatus = "active" | "paused" | "finished"

export const MAX_ACTIVE_CAMPAIGNS = 3
export const MIN_VARIANTS = 3
export const MAX_VARIANTS = 5
export const MAX_TITLE_LENGTH = 80

/** The user's own tweet targeted by a Campaign. */
export interface SourceTweet {
  id: string
  url: string
  authorId: string
  authorHandle: string
  text?: string
}

export interface Campaign {
  id: string
  /** Chosen by the user; without it the panel shows the tweet's first line. */
  title?: string
  sourceTweet: SourceTweet
  keyword: string
  leadMagnetUrl: string
  /** Earlier links to the same lead magnet: found in the DMs, they count as already sent. */
  formerLinks?: string[]
  templates: MessageTemplates
  mustFollow: boolean
  durationHours: number
  createdAt: number
  endsAt: number
  status: CampaignStatus
  /** Paused by the CircuitBreaker, not by the user: resumed when it resets. */
  stoppedBy?: "breaker"
  /** Comments already looked at (matched, reviewed or rejected), never processed twice. */
  seenCommentIds: string[]
  lastScanAt?: number
}

const TWEET_URL = /^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\/(\d+)(?:[/?#]\S*)?$/

/** Extracts the author handle and tweet id from an x.com (or twitter.com) status URL. */
export function parseTweetUrl(url: string): { handle: string; tweetId: string } | null {
  const match = TWEET_URL.exec(url.trim())
  return match ? { handle: match[1]!, tweetId: match[2]! } : null
}

export function isExpired(campaign: Campaign, now: number): boolean {
  return now >= campaign.endsAt
}

/** Active Campaigns, and finished ones until their queue is empty: whoever commented in time still gets the lead magnet. */
export function isServed(campaign: Campaign): boolean {
  return campaign.status !== "paused"
}

export function activeCount(campaigns: readonly Campaign[]): number {
  return campaigns.filter((c) => c.status === "active").length
}

/** Every family needs 3 to 5 non-empty variants. */
export function templatesAreValid(templates: MessageTemplates): boolean {
  return Object.values(templates).every(
    (variants: string[]) =>
      variants.length >= MIN_VARIANTS && variants.length <= MAX_VARIANTS && variants.every((v) => v.trim().length > 0)
  )
}
