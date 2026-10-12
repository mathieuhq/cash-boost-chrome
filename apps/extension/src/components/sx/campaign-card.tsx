import { useState } from "react"

import { Button } from "~components/ui/button"
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "~components/ui/popover"
import { duration } from "~lib/format"
import { cn } from "~lib/utils"
import type { CampaignView } from "~sidepanel/model"

import { ActionLog } from "./action-log"
import { Gem } from "./gem"
import { StatusBadge } from "./status-badge"

interface CampaignCardProps {
  campaign: CampaignView
  now: number
  onPause?: () => void
  onResume?: () => void
  onExport?: () => void
  onDelete?: () => void
}

/** A Campaign: gem, title, badge, source tweet, three counters, last actions, one-line footer. */
export function CampaignCard({ campaign, now, onPause, onResume, onExport, onDelete }: CampaignCardProps) {
  const { status } = campaign
  const live = status === "active"
  const meta =
    status === "active"
      ? `fin dans ${duration(campaign.endsAt - now)}`
      : status === "paused"
        ? "en pause"
        : "terminée"

  return (
    <article className="flex flex-col gap-4 rounded-xl bg-card p-4 text-card-foreground shadow-card">
      <div className="flex items-start gap-3">
        <Gem tone={live ? "brand" : "muted"} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate text-sm leading-5 font-medium">{campaign.title}</h3>
            <StatusBadge status={status} />
          </div>
          {campaign.tweetText && (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{campaign.tweetText}</p>
          )}
        </div>
      </div>

      <div
        className={cn(
          "grid grid-cols-3 rounded-lg shadow-[inset_0_0_0_1px_var(--border)]",
          status === "paused" && "sx-stripes"
        )}>
        <Metric label="Leads" value={campaign.leads} gradient={live} />
        <Metric label="DMs" value={campaign.sent} />
        <Metric label="En file" value={campaign.queued} />
      </div>

      {campaign.log.length > 0 && (
        <ActionLog
          // Nothing runs on a paused or finished Campaign: its current action waits in the queue.
          items={campaign.log
            .slice(-3)
            .map((item) => (!live && item.state === "current" ? { ...item, state: "queued" } : item))}
        />
      )}

      <div className="-mt-1 -mr-1.5 -mb-1.5 flex min-w-0 items-center gap-2">
        <span className="text-mono min-w-0 flex-auto truncate text-muted-foreground">
          <span className="text-brand-ink">{campaign.keyword}</span> · {meta}
        </span>
        <div className="flex flex-none">
          <Button size="xs" variant="ghost" onClick={onExport}>
            Exporter
          </Button>
          {live && (
            <Button size="xs" variant="ghost" onClick={onPause}>
              Pause
            </Button>
          )}
          {status === "paused" && (
            <Button size="xs" variant="ghost" onClick={onResume}>
              Reprendre
            </Button>
          )}
          <DeleteButton keyword={campaign.keyword} leads={campaign.leads} onConfirm={onDelete} />
        </div>
      </div>
    </article>
  )
}

/** Deleting stops the Campaign for good; its Leads stay in the Leads tab for the export. Ask once, in place. */
function DeleteButton({ keyword, leads, onConfirm }: { keyword: string; leads: number; onConfirm?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="xs" variant="ghost" className="hover:text-destructive">
          Supprimer
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-64 flex-col gap-3">
        <PopoverHeader>
          <PopoverTitle>Supprimer la campagne {keyword} ?</PopoverTitle>
          <PopoverDescription>
            {leads > 0 ? "Elle s'arrête définitivement. Ses leads restent dans l'onglet Leads pour l'export." : "Elle sera effacée."}
          </PopoverDescription>
        </PopoverHeader>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => {
              setOpen(false)
              onConfirm?.()
            }}>
            Supprimer
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function Metric({ label, value, gradient = false }: { label: string; value: number; gradient?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 px-3 py-2 [&+&]:border-l [&+&]:border-border">
      <span className="text-mono text-muted-foreground">{label}</span>
      <span className={cn("text-metric", gradient && "sx-gradient-text font-semibold")}>{value}</span>
    </div>
  )
}
