import { forwardRef } from "react"

import { CampaignCard } from "~components/sx/campaign-card"
import { Composer } from "~components/sx/composer"
import { EmptySlot } from "~components/sx/empty-state"
import { Headline } from "~components/sx/headline"
import { SectionHeader } from "~components/sx/section-header"
import { notify } from "~components/sx/toast-pill"
import { downloadCsv, leadsToCsv } from "~lib/csv"
import { clock, plural } from "~lib/format"

import { MAX_ACTIVE_CAMPAIGNS, type PanelState } from "../model"
import { errorMessage } from "../errors"
import { useEngine, usePanel } from "../store"

function blockedReason(state: PanelState, running: number): string | undefined {
  if (state.breaker) return "Relance les campagnes pour en créer une nouvelle."
  if (!state.tosAccepted) return "Accepte l'avertissement ci-dessus pour lancer une campagne."
  if (running >= MAX_ACTIVE_CAMPAIGNS) return "3 campagnes en cours au maximum : mets-en une en pause."
  return undefined
}

/** Why nothing happens right now, when the account rests like its owner would (ADR 0011). */
function restSentence(rest: NonNullable<PanelState["tick"]["rest"]>): string {
  const at = clock(rest.until)
  return rest.reason === "night" ? `En veille pour la nuit · reprise vers ${at}` : `Petite pause · reprise à ${at}`
}

export const CampaignsView = forwardRef<HTMLTextAreaElement, { now: number }>(
  function CampaignsView({ now }, composerRef) {
    const { state, send } = useEngine()
    const { defaults } = usePanel()
    const current = state.campaigns.filter((c) => c.status !== "finished")
    const running = current.filter((c) => c.status === "active").length
    const delivered = state.campaigns.reduce((sum, c) => sum + c.sent, 0)

    const focusComposer = () => {
      const el = typeof composerRef === "function" ? null : composerRef?.current
      el?.focus()
    }

    return (
      <div className="flex flex-col gap-3">
        <Headline
          inline
          title={delivered > 0 ? plural(delivered, "lead magnet livré", "lead magnets livrés") : "Configure ta"}
          accent={delivered > 0 ? "en DM" : "première campagne"}
        />

        <div className="mt-3">
          <Composer
            ref={composerRef}
            blockedReason={blockedReason(state, current.length)}
            defaults={defaults}
            onLaunch={async (draft) => {
              const result = await send({ type: "launch", input: draft })
              if (!result.ok) return errorMessage(result.error)
              notify({ children: draft.title ? `Campagne « ${draft.title} » lancée` : `Campagne ${draft.keyword} lancée` })
              return undefined
            }}
          />
        </div>

        <div className="mt-4">
          <SectionHeader
            title="Campagnes actives"
            action={<span className="text-mono text-muted-foreground">{current.length}/{MAX_ACTIVE_CAMPAIGNS}</span>}
          />
        </div>
        {running > 0 && state.tick.rest && (
          <p className="text-xs text-muted-foreground">{restSentence(state.tick.rest)}</p>
        )}
        {current.map((campaign) => (
          <CampaignCard
            key={campaign.id}
            campaign={campaign}
            now={now}
            onPause={() => send({ type: "pause", campaignId: campaign.id })}
            onResume={async () => {
              const result = await send({ type: "resume", campaignId: campaign.id })
              if (!result.ok) notify({ children: errorMessage(result.error) })
            }}
            onDelete={async () => {
              const result = await send({ type: "delete", campaignId: campaign.id })
              notify({ children: result.ok ? `Campagne ${campaign.keyword} supprimée` : errorMessage(result.error) })
            }}
            onExport={() =>
              downloadCsv(
                `super-x-${campaign.keyword.toLowerCase()}.csv`,
                leadsToCsv(state.leads.filter((l) => l.campaignId === campaign.id))
              )
            }
          />
        ))}
        {current.length < MAX_ACTIVE_CAMPAIGNS && (
          <EmptySlot onClick={focusComposer}>Emplacement libre · nouvelle campagne</EmptySlot>
        )}
      </div>
    )
  }
)
