import type { LucideIcon } from "lucide-react"

import { Gem } from "./gem"

/** Rerun's hatched empty box: a gem, a title, one value sentence and an action. */
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
    <div className="sx-stripes relative flex flex-col items-center gap-2 overflow-hidden rounded-xl px-6 py-8 text-center shadow-[inset_0_0_0_1px_var(--border)]">
      <Gem icon={icon} size="lg" className="mb-3" />
      <p className="text-sm leading-5 font-medium">{title}</p>
      {children && <p className="mb-2 max-w-[260px] text-xs text-muted-foreground">{children}</p>}
      {action}
    </div>
  )
}

/** A free, clickable slot (hatched). */
export function EmptySlot({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="sx-stripes flex h-[52px] w-full cursor-pointer items-center justify-center rounded-xl text-xs font-medium text-muted-foreground shadow-[inset_0_0_0_1px_var(--border)] transition-[color,box-shadow] hover:text-foreground hover:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--brand)_50%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
      {children}
    </button>
  )
}
