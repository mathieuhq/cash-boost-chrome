import * as React from "react"
import { Progress as ProgressPrimitive } from "radix-ui"

import { cn } from "~lib/utils"

const toneClass = {
  brand: "bg-linear-to-r from-brand-light to-brand shadow-[0_0_10px_var(--brand-glow)]",
  warning: "bg-warning",
  destructive: "bg-destructive",
} as const

// DS: glowing brand gradient fill; warning ≥ 80 %, destructive at 100 % (no glow).
function Progress({
  className,
  value,
  tone = "brand",
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & {
  tone?: keyof typeof toneClass
}) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "relative h-1.5 w-full rounded-full bg-foreground/7",
        className
      )}
      value={value}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn("h-full rounded-full transition-[width] duration-400", toneClass[tone])}
        style={{ width: `${value ?? 0}%` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
