import { QuotaMeter } from "~components/sx/quota-meter"
import { SectionHeader } from "~components/sx/section-header"
import { TemplatesEditor } from "~components/sx/templates-editor"
import { Button } from "~components/ui/button"
import { Card, CardDescription } from "~components/ui/card"
import { Switch } from "~components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "~components/ui/tabs"

import { DURATIONS } from "../draft"
import { OpenRouterKeyForm } from "../gates"
import type { CampaignDefaults } from "../model"
import { useEngine, usePanel } from "../store"

const FULL = "Plafond atteint : les leads attendent dans la file."

export function OptionsView() {
  const { state, send } = useEngine()
  const { defaults } = usePanel()
  const { dms, likes, replies } = state.quotas

  // Saved on every change; only new Campaigns use them.
  const update = (patch: Partial<CampaignDefaults>) => send({ type: "setCampaignDefaults", defaults: { ...defaults, ...patch } })

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader title="Nouvelles campagnes" />
      <Card>
        <div className="flex flex-col gap-2">
          <span className="text-[13px] leading-[14px] font-medium">Messages</span>
          <TemplatesEditor templates={defaults.templates} onChange={(templates) => update({ templates })} />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-[13px] leading-[14px] font-medium">Durée de surveillance</span>
          <Tabs value={String(defaults.durationHours)} onValueChange={(value) => update({ durationHours: Number(value) })}>
            <TabsList aria-label="Durée de surveillance">
              {DURATIONS.map((hours) => (
                <TabsTrigger key={hours} value={String(hours)}>
                  {hours}h
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] leading-[14px] font-medium">Doit me suivre</span>
          <Switch
            aria-label="Doit me suivre"
            checked={defaults.mustFollow}
            onCheckedChange={(mustFollow) => update({ mustFollow })}
          />
        </div>
      </Card>

      <div className="mt-4">
        <SectionHeader title="Classification des commentaires" />
      </div>
      <Card>
        <OpenRouterKeyForm />
      </Card>

      <div className="mt-4">
        <SectionHeader title="Quotas du compte X" />
      </div>
      <Card>
        <QuotaMeter label="Nouveaux DMs" period="jour" {...dms} note={dms.used >= dms.limit ? FULL : undefined} />
        <QuotaMeter label="Likes" period="heure" {...likes} note={likes.used >= likes.limit ? FULL : undefined} />
        <QuotaMeter label="Réponses" period="jour" {...replies} note={replies.used >= replies.limit ? FULL : undefined} />
      </Card>

      <div className="mt-4">
        <SectionHeader title="Arrêt d'urgence" />
      </div>
      <Card>
        <CardDescription className="truncate text-xs">Coupe toutes les campagnes tout de suite.</CardDescription>
        <Button variant="destructive" disabled={!!state.breaker} onClick={() => send({ type: "killSwitch" })}>
          {state.breaker ? "Campagnes arrêtées" : "Tout arrêter"}
        </Button>
      </Card>
    </div>
  )
}
