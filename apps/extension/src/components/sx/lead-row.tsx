import { clock } from "~lib/format"
import type { LeadView } from "~sidepanel/model"

import { Avatar } from "./avatar"
import { StatusBadge } from "./status-badge"

/** One Lead: X profile picture (or initials), name, mono handle, Comment, Delivery badge and time. Stack rows in one Card. */
export function LeadRow({ lead }: { lead: LeadView }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 [&+&]:border-t [&+&]:border-border">
      <Avatar name={lead.name} src={lead.avatar} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate text-[13px] font-medium">{lead.name}</span>
          <span className="text-mono truncate text-muted-foreground">@{lead.handle}</span>
        </div>
        <span className="truncate text-xs text-muted-foreground">{lead.comment}</span>
      </div>
      <div className="flex flex-none flex-col items-end gap-1">
        <StatusBadge status={lead.status} size="sm" />
        <span className="text-mono text-muted-foreground">{clock(lead.at)}</span>
      </div>
    </div>
  )
}
