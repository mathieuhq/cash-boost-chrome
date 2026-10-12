import { forwardRef, useState } from "react"

import { Button } from "~components/ui/button"
import { Input } from "~components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "~components/ui/popover"
import { Switch } from "~components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~components/ui/tabs"
import { Textarea } from "~components/ui/textarea"
import { cn } from "~lib/utils"
import {
  DURATIONS,
  emptyDraft,
  MAX_VARIANTS,
  MIN_VARIANTS,
  toVariants,
  validateDraft,
  type DraftErrors,
} from "~sidepanel/draft"
import type { CampaignDraft, MessageTemplates } from "~sidepanel/model"

import { Field, Var } from "./field"

interface ComposerProps {
  /** Why launching is impossible right now (ToS not accepted, 3 active campaigns, breaker…). */
  blockedReason?: string
  /** Resolves with an error message to keep the draft, or nothing once launched. */
  onLaunch: (draft: CampaignDraft) => Promise<string | undefined>
}

/**
 * Rerun's prompt box applied to creating a Campaign: paste the tweet URL, set the rest in chips, launch.
 * The bar always fits on one line; chips scroll horizontally under a fade when space runs out.
 */
export const Composer = forwardRef<HTMLTextAreaElement, ComposerProps>(function Composer(
  { blockedReason, onLaunch },
  ref
) {
  const [draft, setDraft] = useState<CampaignDraft>(emptyDraft)
  const [errors, setErrors] = useState<DraftErrors>({})

  const update = (patch: Partial<CampaignDraft>) => {
    setDraft((d) => ({ ...d, ...patch }))
    setErrors({})
  }

  const [launching, setLaunching] = useState(false)

  const submit = async () => {
    if (blockedReason || launching) return
    const found = validateDraft(draft)
    setErrors(found)
    if (Object.keys(found).length > 0) return
    setLaunching(true)
    const error = await onLaunch({ ...draft, keyword: draft.keyword.trim(), tweetUrl: draft.tweetUrl.trim() })
    setLaunching(false)
    if (error) setErrors({ tweetUrl: error })
    else setDraft(emptyDraft())
  }

  const firstError = errors.tweetUrl ?? errors.keyword ?? errors.leadMagnetUrl ?? errors.templates

  return (
    <div className="flex flex-col gap-2">
      <div className="sx-composer-glow relative">
        <div className="relative z-[1] flex flex-col gap-2 rounded-xl bg-card p-3 shadow-card transition-shadow focus-within:shadow-[0_0_0_1px_color-mix(in_oklab,var(--brand)_50%,transparent),0_0_0_4px_color-mix(in_oklab,var(--brand)_12%,transparent),0_12px_34px_-20px_rgba(0,0,0,.7)]">
          <textarea
            ref={ref}
            rows={2}
            aria-label="URL du tweet"
            aria-invalid={errors.tweetUrl ? true : undefined}
            placeholder="Colle l'URL de ton tweet lead magnet…"
            value={draft.tweetUrl}
            onChange={(e) => update({ tweetUrl: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            className="min-h-[52px] w-full resize-none border-0 bg-transparent p-0.5 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <div className="flex min-w-0 flex-nowrap items-center gap-2">
            <div className="sx-chips flex min-w-0 flex-auto gap-1 overflow-x-auto">
              <ChipPopover label="Mot-clé" value={draft.keyword || undefined} invalid={!!errors.keyword}>
                <Field label="Mot-clé" description="Le mot que les gens doivent commenter">
                  <Input
                    mono
                    autoFocus
                    placeholder="GUIDE"
                    value={draft.keyword}
                    onChange={(e) => update({ keyword: e.target.value })}
                  />
                </Field>
              </ChipPopover>

              <ChipPopover label="Lien" invalid={!!errors.leadMagnetUrl} filled={!!draft.leadMagnetUrl}>
                <Field label="Lead magnet" description="Le lien envoyé en DM à chaque lead.">
                  <Input
                    mono
                    autoFocus
                    type="url"
                    placeholder="https://"
                    value={draft.leadMagnetUrl}
                    onChange={(e) => update({ leadMagnetUrl: e.target.value })}
                  />
                </Field>
              </ChipPopover>

              <ChipPopover
                label="Messages"
                filled
                invalid={!!errors.templates}
                wide>
                <TemplatesEditor
                  templates={draft.templates}
                  onChange={(templates) => update({ templates })}
                />
              </ChipPopover>

              <ChipPopover label={`${draft.durationHours} h`} filled>
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <span className="text-[13px] leading-[14px] font-medium">Durée de surveillance</span>
                    <div className="flex gap-1">
                      {DURATIONS.map((hours) => (
                        <Button
                          key={hours}
                          size="xs"
                          variant={draft.durationHours === hours ? "default" : "outline"}
                          onClick={() => update({ durationHours: hours })}>
                          {hours} h
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[13px] leading-[14px] font-medium">Doit me suivre</span>
                      <Switch
                        aria-label="Doit me suivre"
                        checked={draft.mustFollow}
                        onCheckedChange={(mustFollow) => update({ mustFollow })}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">Le DM ne part qu'aux leads qui te suivent.</span>
                  </div>
                </div>
              </ChipPopover>
            </div>
            <Button size="xs" className="flex-none" onClick={submit} disabled={!!blockedReason || launching}>
              {launching ? "Vérification…" : "Lancer"}
            </Button>
          </div>
        </div>
      </div>
      {(blockedReason || firstError) && (
        <p className={cn("px-1 text-xs", firstError ? "text-destructive" : "text-muted-foreground")}>
          {firstError ?? blockedReason}
        </p>
      )}
    </div>
  )
})

function ChipPopover({
  label,
  value,
  filled,
  invalid,
  wide,
  children,
}: {
  label: string
  value?: string
  filled?: boolean
  invalid?: boolean
  wide?: boolean
  children: React.ReactNode
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-invalid={invalid || undefined}
          className={cn(
            "inline-flex h-7 flex-none cursor-pointer items-center gap-1.5 rounded-full border border-border bg-transparent px-2 text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            (value || filled) && "text-foreground",
            invalid && "border-destructive text-destructive"
          )}>
          {label}
          {value && <b className="-ml-0.5 font-mono font-medium text-brand-ink">{value}</b>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className={cn("w-[min(18rem,calc(100vw-32px))]", wide && "w-[min(22rem,calc(100vw-32px))]")}>
        {children}
      </PopoverContent>
    </Popover>
  )
}

const FAMILIES: { id: keyof MessageTemplates; label: string; hint: string }[] = [
  { id: "dm", label: "DM", hint: "Le lien du lead magnet suit le message." },
  { id: "ackSent", label: "Envoyé", hint: "Réponse publique quand le DM est parti." },
  { id: "ackDmClosed", label: "DM fermé", hint: "Réponse publique quand le DM est impossible." },
]

function TemplatesEditor({
  templates,
  onChange,
}: {
  templates: MessageTemplates
  onChange: (templates: MessageTemplates) => void
}) {
  // Keep raw text per family so typing a newline is not swallowed by the split/join round trip.
  const [raw, setRaw] = useState(() => ({
    dm: templates.dm.join("\n"),
    ackSent: templates.ackSent.join("\n"),
    ackDmClosed: templates.ackDmClosed.join("\n"),
  }))

  return (
    <Tabs defaultValue="dm">
      <TabsList>
        {FAMILIES.map((f) => (
          <TabsTrigger key={f.id} value={f.id}>
            {f.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {FAMILIES.map((f) => {
        const count = templates[f.id].length
        const ok = count >= MIN_VARIANTS && count <= MAX_VARIANTS
        return (
          <TabsContent key={f.id} value={f.id} className="flex flex-col gap-2">
            <Textarea
              aria-label={`Variantes ${f.label}`}
              rows={5}
              className="max-h-48 text-[13px] leading-[18px]"
              value={raw[f.id]}
              onChange={(e) => {
                const text = e.target.value
                setRaw((r) => ({ ...r, [f.id]: text }))
                onChange({ ...templates, [f.id]: toVariants(text) })
              }}
            />
            <div className="flex items-start justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {f.hint} Variables : <Var>{"{prénom}"}</Var> <Var>{"{@handle}"}</Var> et une variante par ligne
              </span>
              <span className={cn("text-mono flex-none", !ok && "text-destructive")}>
                {count}/{MAX_VARIANTS}
              </span>
            </div>
          </TabsContent>
        )
      })}
    </Tabs>
  )
}
