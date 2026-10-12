import type { LucideIcon } from "lucide-react"
import { Tabs as TabsPrimitive } from "radix-ui"

export interface NavItem {
  id: string
  label: string
  icon: LucideIcon
  count?: number
}

/** Main navigation: icon tile + label per section, hairline grid, the active tile filled in brand with a short underline. */
export function NavTiles({ items, label }: { items: NavItem[]; label: string }) {
  return (
    <TabsPrimitive.List
      aria-label={label}
      className="grid auto-cols-fr grid-flow-col border-y border-border bg-background">
      {items.map(({ id, label, icon: Icon, count }) => (
        <TabsPrimitive.Trigger
          key={id}
          value={id}
          className="group relative flex cursor-pointer flex-col items-center gap-1.5 overflow-hidden border-r border-border px-1 pt-3 pb-2.5 text-xs font-medium text-muted-foreground transition-colors outline-none last:border-r-0 hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring data-[state=active]:text-foreground">
          <span
            aria-hidden="true"
            className="absolute inset-x-1/4 bottom-0 h-0.5 rounded-full bg-primary opacity-0 group-data-[state=active]:opacity-100"
          />
          <span className="relative grid size-8 place-items-center rounded-lg bg-primary/5 group-data-[state=active]:bg-primary group-data-[state=active]:text-primary-foreground group-data-[state=active]:shadow-button">
            <Icon className="size-4" aria-hidden="true" />
            {count ? (
              <span className="absolute -top-1.5 -right-2 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] leading-none font-semibold text-brand-foreground shadow-[0_0_0_2px_var(--background)]">
                {count}
              </span>
            ) : null}
          </span>
          <span className="relative">{label}</span>
        </TabsPrimitive.Trigger>
      ))}
    </TabsPrimitive.List>
  )
}
