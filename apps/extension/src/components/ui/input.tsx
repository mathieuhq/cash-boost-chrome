import * as React from "react"

import { cn } from "~lib/utils"

// DS: brand border + 3px brand halo on focus; `mono` for keyword and URLs.
function Input({
  className,
  type,
  mono = false,
  ...props
}: React.ComponentProps<"input"> & { mono?: boolean }) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-sm shadow-xs transition-[border-color,box-shadow] outline-none placeholder:text-muted-foreground disabled:pointer-events-none disabled:opacity-50",
        "focus-visible:border-brand focus-visible:ring-[3px] focus-visible:ring-brand/20",
        "aria-invalid:border-destructive",
        mono && "font-mono text-[13px]",
        className
      )}
      {...props}
    />
  )
}

export { Input }
