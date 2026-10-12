// Commands sent by the side panel to the service worker, which owns the engine (ADR 0002).
import type { CampaignInput } from "@super-x/application"

export type Command =
  | { type: "signIn" }
  | { type: "signOut" }
  | { type: "refreshAccess" }
  | { type: "linkStudent"; email: string }
  | { type: "verifyStudent"; code: string }
  | { type: "checkout" }
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
