export type DeliveryStatus = "queued" | "sent" | "dm_closed" | "failed"
export type AcknowledgementStatus = "none" | "sent" | "dm_closed"
export type MatchKind = "exact" | "classified" | "manual"

export interface XUser {
  id: string
  handle: string
  name: string
  /** X profile picture URL (pbs.twimg.com), as seen when the Comment was scanned. */
  avatar?: string
}

export interface CommentRef {
  id: string
  text: string
}

/** Author of a matched Comment. Unique per (Campaign, author). */
export interface Lead {
  id: string
  campaignId: string
  author: XUser
  comment: CommentRef
  matchedBy: MatchKind
  probability?: number
  createdAt: number
  liked: boolean
  delivery: DeliveryStatus
  ack: AcknowledgementStatus
  dmAttempts: number
  lastDmAttemptAt?: number
  deliveredAt?: number
  /** The lead magnet link was already in the DMs: nothing was sent, the like and reply still happen. */
  alreadySent?: boolean
  /** Drawn at creation: a person does not answer every comment, this one gets no public "sent" reply. */
  skipAck?: true
  /** Consecutive transient errors on the current step; 3 → failed. */
  errors?: number
  failure?: string
}

export type Step = { kind: "like" } | { kind: "dm" } | { kind: "reply"; ack: "sent" | "dm_closed" }

export function newLead(input: {
  id: string
  campaignId: string
  author: XUser
  comment: CommentRef
  matchedBy: MatchKind
  probability?: number
  at: number
}): Lead {
  return {
    id: input.id,
    campaignId: input.campaignId,
    author: input.author,
    comment: input.comment,
    matchedBy: input.matchedBy,
    ...(input.probability === undefined ? {} : { probability: input.probability }),
    createdAt: input.at,
    liked: false,
    delivery: "queued",
    ack: "none",
    dmAttempts: 0,
  }
}

/**
 * DM first (the DMs are checked before anything public happens) → like → public reply "sent" (unless skipped).
 * If DMs are closed: like, reply "dm_closed" once, then retry the DM at most once per Tick
 * (after `lastScanAt`) until the Campaign ends.
 */
export function nextStep(lead: Lead, lastScanAt: number): Step | null {
  if (lead.delivery === "queued") return { kind: "dm" }
  if (lead.delivery === "failed") return null
  if (!lead.liked) return { kind: "like" }
  switch (lead.delivery) {
    case "sent":
      return lead.ack === "none" && !lead.skipAck ? { kind: "reply", ack: "sent" } : null
    case "dm_closed":
      if (lead.ack === "none") return { kind: "reply", ack: "dm_closed" }
      return (lead.lastDmAttemptAt ?? 0) < lastScanAt ? { kind: "dm" } : null
  }
}
