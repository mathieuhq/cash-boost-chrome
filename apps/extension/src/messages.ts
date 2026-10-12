// Commands sent by the side panel to the service worker, which owns the engine (ADR 0002).
import type { CampaignInput } from "@super-x/application"

import type { ActiveHoursChoice, CampaignDefaults, RampUpChoice } from "~sidepanel/model"

export type Command =
  /** null removes the key. */
  | { type: "setOpenRouterKey"; key: string | null }
  | { type: "setCampaignDefaults"; defaults: CampaignDefaults }
  | { type: "setActiveHours"; hours: ActiveHoursChoice }
  | { type: "setRampUp"; rampUp: RampUpChoice }
  | { type: "connectX" }
  | { type: "acceptTos" }
  | { type: "launch"; input: CampaignInput }
  | { type: "pause"; campaignId: string }
  | { type: "resume"; campaignId: string }
  | { type: "delete"; campaignId: string }
  | { type: "approve"; reviewId: string }
  | { type: "reject"; reviewId: string }
  | { type: "killSwitch" }
  | { type: "restart" }

export type CommandResult = { ok: true } | { ok: false; error: string }

export async function send(command: Command): Promise<CommandResult> {
  try {
    const result = (await chrome.runtime.sendMessage(command)) as CommandResult | undefined
    return result ?? { ok: false, error: "no_response" }
  } catch {
    return { ok: false, error: "no_response" }
  }
}
