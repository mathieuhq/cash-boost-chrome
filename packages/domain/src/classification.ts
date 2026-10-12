export interface Thresholds {
  /** p ≥ accept → processed automatically. */
  accept: number
  /** review ≤ p < accept → PendingReview. Below → rejected. */
  review: number
}

export const DEFAULT_THRESHOLDS: Thresholds = { accept: 0.8, review: 0.4 }

export type Decision = "accept" | "review" | "reject"

export function decide(probability: number, thresholds: Thresholds): Decision {
  if (probability >= thresholds.accept) return "accept"
  if (probability >= thresholds.review) return "review"
  return "reject"
}
