import { CircleCheck, CircleX, Lock } from "lucide-react"

import type { ActionLogItem } from "~sidepanel/model"
import { cn } from "~lib/utils"

import { StatusBadge } from "./status-badge"

const MARK = { done: CircleCheck, failed: CircleX, waiting: Lock } as const

/** Activity list: one line per Action of a Tick. */
export function ActionLog({ items, bare = false }: { items: ActionLogItem[]; bare?: boolean }) {
  return (
    <ul className={cn("flex flex-col gap-2", !bare && "border-t border-border pt-2")}>
      {items.map((item, i) => {
        const Mark = item.state in MARK ? MARK[item.state as keyof typeof MARK] : null
        return (
          <li key={i} className="flex min-h-[19px] items-center gap-2 text-xs leading-4">
            <span
              className={cn(
                "grid size-3.5 flex-none place-items-center",
                item.state === "done" && "text-success",
                item.state === "failed" && "text-destructive",
                item.state === "waiting" && "text-warning"
              )}>
              {Mark ? (
                <Mark className="size-3.5" aria-hidden="true" />
              ) : item.state === "current" ? (
                <span className="size-1.5 rounded-full bg-brand shadow-[0_0_0_3px_var(--brand-soft)]" />
              ) : (
                <span className="size-2.5 rounded-full border-[1.5px] border-dashed border-input" />
              )}
            </span>
            <span
              className={cn(
                "min-w-0 flex-1 truncate",
                item.state === "done" && "text-muted-foreground line-through decoration-muted-foreground/50",
                item.state === "current" && "font-medium"
              )}>
              {item.label}
            </span>
            {item.state === "current" ? (
              <StatusBadge status="running" size="sm" />
            ) : item.time ? (
              <span className="text-mono text-muted-foreground">{item.time}</span>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
