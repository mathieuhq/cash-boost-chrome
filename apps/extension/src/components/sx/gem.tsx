import { Zap, type LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "~lib/utils"

interface GemProps {
  icon?: LucideIcon
  /** Custom ink drawn in place of `icon` (e.g. the Cash Boost mark). */
  glyph?: ReactNode
  text?: string
  size?: "sm" | "default" | "lg"
  tone?: "brand" | "muted"
  className?: string
}

/** The glossy brand tile (Rerun's gem, in brand black). Max three brand gems on screen. */
export function Gem({ icon: Icon = Zap, glyph, text, size = "default", tone = "brand", className }: GemProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "sx-gem",
        size !== "default" && `sx-gem-${size}`,
        tone === "muted" && "sx-gem-muted",
        className
      )}>
      <span className="sx-gem-slab" />
      <span className="sx-gem-face" />
      <span className="sx-gem-ink">{text ? <b>{text}</b> : (glyph ?? <Icon />)}</span>
    </span>
  )
}
