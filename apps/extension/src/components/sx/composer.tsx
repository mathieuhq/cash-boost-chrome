import { forwardRef, useState } from "react"

import { Button } from "~components/ui/button"
import { Input } from "~components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "~components/ui/popover"
import { cn } from "~lib/utils"
import { emptyDraft, MAX_TITLE_LENGTH, validateDraft, type DraftErrors } from "~sidepanel/draft"
import type { CampaignDefaults, CampaignDraft } from "~sidepanel/model"

import { Field } from "./field"

interface ComposerProps {
  /** Why launching is impossible right now (ToS not accepted, 3 active campaigns, breaker…). */
  blockedReason?: string
  /** Messages, duration and follow rule, set in the Options tab. */
  defaults: CampaignDefaults
  /** Resolves with an error message to keep the draft, or nothing once launched. */
  onLaunch: (draft: CampaignDraft) => Promise<string | undefined>
}

/**
 * Prompt box for creating a Campaign: paste the tweet URL, set the rest in chips, launch.
 * The bar always fits on one line; chips scroll horizontally under a fade when space runs out.
 */
export const Composer = forwardRef<HTMLTextAreaElement, ComposerProps>(function Composer(
  { blockedReason, defaults, onLaunch },
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
    const full = { ...draft, ...defaults }
    const found = validateDraft(full)
    setErrors(found)
    if (Object.keys(found).length > 0) return
    setLaunching(true)
    const error = await onLaunch({
      ...full,
      title: draft.title.trim(),
      keyword: draft.keyword.trim(),
      tweetUrl: draft.tweetUrl.trim(),
    })
    setLaunching(false)
    if (error) setErrors({ tweetUrl: error })
    else setDraft(emptyDraft())
  }

  const firstError =
    errors.tweetUrl ?? errors.keyword ?? errors.leadMagnetUrl ?? (errors.templates && `${errors.templates} Corrige-les dans Options.`)

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
              <ChipPopover label={draft.title.trim() || "Titre"} filled={!!draft.title.trim()}>
                <Field label="Titre" description="Par défaut, la première ligne du tweet">
                  <Input
                    autoFocus
                    maxLength={MAX_TITLE_LENGTH}
                    placeholder="Template Notion freelance"
                    value={draft.title}
                    onChange={(e) => update({ title: e.target.value })}
                  />
                </Field>
              </ChipPopover>

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
                <Field label="Lead magnet" description="Le lien envoyé en DM à chaque lead">
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
  children,
}: {
  label: string
  value?: string
  filled?: boolean
  invalid?: boolean
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
          <span className="max-w-32 truncate">{label}</span>
          {value && <b className="-ml-0.5 font-mono font-medium text-brand-ink">{value}</b>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(18rem,calc(100vw-32px))]">
        {children}
      </PopoverContent>
    </Popover>
  )
}
