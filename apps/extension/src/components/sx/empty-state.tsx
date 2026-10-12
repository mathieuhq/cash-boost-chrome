import type { LucideIcon } from "lucide-react"

import { Gem } from "./gem"

/** Dashed empty box: a gem, a title, one value sentence and an action. */
export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: LucideIcon
  title: React.ReactNode
  children?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="relative flex flex-col items-center gap-2 overflow-hidden rounded-xl border border-dashed border-foreground/20 bg-muted px-6 py-8 text-center">
      <Gem icon={icon} size="lg" className="mb-3" />
      <p className="text-sm leading-5 font-medium">{title}</p>
      {children && <p className="mb-2 max-w-[260px] text-xs text-muted-foreground">{children}</p>}
      {action}
    </div>
  )
}

/** A free, clickable slot (dashed). */
export function EmptySlot({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-[52px] w-full cursor-pointer items-center justify-center rounded-xl border border-dashed border-foreground/20 bg-transparent text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
      {children}
    </button>
  )
}
