export interface TrialState {
  trialStartedAt: number | null
  trialXUserId: string | null
}

/**
 * A Trial is unique per Google account AND per X account. `start` still has to claim the X account.
 * `same`: this account already started its Trial with this X account (idempotent retry).
 */
export function trialRequest(state: TrialState, xUserId: string): "start" | "same" | "used" {
  if (state.trialStartedAt === null) return "start"
  return state.trialXUserId === xUserId ? "same" : "used"
}
