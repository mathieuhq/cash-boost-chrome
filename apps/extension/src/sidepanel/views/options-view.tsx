import { ChevronDown } from "lucide-react"

import { QuotaMeter } from "~components/sx/quota-meter"
import { SectionHeader } from "~components/sx/section-header"
import { TemplatesEditor } from "~components/sx/templates-editor"
import { Button } from "~components/ui/button"
import { Card, CardDescription } from "~components/ui/card"
import { Switch } from "~components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "~components/ui/tabs"

import { cn } from "~lib/utils"

import { DURATIONS, HOURS, RAMP_UP_DAYS } from "../draft"
import { OpenRouterKeyForm } from "../gates"
import type { ActiveHoursChoice, CampaignDefaults, RampUpChoice } from "../model"
import { useEngine, usePanel } from "../store"

const FULL = "Plafond atteint : les leads attendent dans la file."

const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}h`

/** A native select dressed like the Input component: its own arrow is hidden, ours sits inside the padding. */
function HourSelect({ label, value, onChange }: { label: string; value: number; onChange: (hour: number) => void }) {
  return (
    <label className="flex flex-1 flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="relative">
        <select
          aria-label={label}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className={cn(
            "h-9 w-full appearance-none rounded-lg border border-input bg-card pr-9 pl-3 font-mono text-[13px] shadow-xs outline-none",
            "transition-[border-color,box-shadow] focus-visible:border-brand focus-visible:ring-[3px] focus-visible:ring-brand/20"
          )}
        >
          {HOURS.map((hour) => (
            <option key={hour} value={hour}>
              {hourLabel(hour)}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
      </span>
    </label>
  )
}

export function OptionsView() {
  const { state, send } = useEngine()
  const { defaults, activeHours, rampUp: rampUpChoice } = usePanel()
  const { dms, likes, replies, rampUp } = state.quotas

  const update = (patch: Partial<CampaignDefaults>) => send({ type: "setCampaignDefaults", defaults: { ...defaults, ...patch } })
  const updateHours = (patch: Partial<ActiveHoursChoice>) => send({ type: "setActiveHours", hours: { ...activeHours, ...patch } })
  const updateRampUp = (patch: Partial<RampUpChoice>) => send({ type: "setRampUp", rampUp: { ...rampUpChoice, ...patch } })

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
        <SectionHeader title="Heures actives" />
      </div>
      <Card>
        <div className="flex gap-3">
          <HourSelect label="Début" value={activeHours.start} onChange={(start) => updateHours({ start })} />
          <HourSelect label="Fin" value={activeHours.end} onChange={(end) => updateHours({ end })} />
        </div>
      </Card>

      <div className="mt-4">
        <SectionHeader title="Montée en charge" />
      </div>
      <Card>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] leading-[14px] font-medium">Quotas réduits les premiers jours</span>
          <Switch
            aria-label="Quotas réduits les premiers jours"
            checked={rampUpChoice.enabled}
            onCheckedChange={(enabled) => updateRampUp({ enabled })}
          />
        </div>
        {rampUpChoice.enabled && (
          <Tabs value={String(rampUpChoice.days)} onValueChange={(value) => updateRampUp({ days: Number(value) })}>
            <TabsList aria-label="Durée de la montée en charge">
              {RAMP_UP_DAYS.map((days) => (
                <TabsTrigger key={days} value={String(days)}>
                  {days} j
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}
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
        {rampUp && (
          <CardDescription className="text-xs">
            Montée en charge : jour {rampUp.day}/{rampUp.days}. Les plafonds sont réduits les premiers jours, puis varient un peu
            d'un jour à l'autre.
          </CardDescription>
        )}
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
