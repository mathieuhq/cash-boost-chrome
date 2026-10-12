import { cn } from "~lib/utils"

/** Shimmering text for in-progress states only. Present tense, ends with "…". */
export function Shimmer({
  tone = "neutral",
  className,
  children,
}: {
  tone?: "neutral" | "brand"
  className?: string
  children: React.ReactNode
}) {
  return (
    <span className={cn("sx-shimmer", tone === "brand" && "sx-shimmer-brand", className)}>
      {children}
    </span>
  )
}
