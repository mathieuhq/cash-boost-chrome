import * as React from "react"
import { Switch as SwitchPrimitive } from "radix-ui"

import { cn } from "~lib/utils"

// DS: turns brand black with a glow when on; the thumb bounces.
function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-[18px] w-8 shrink-0 cursor-pointer items-center rounded-full border border-input bg-muted p-px transition-[background-color,box-shadow] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-brand data-[state=checked]:bg-brand data-[state=checked]:shadow-glow",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-3.5 rounded-full bg-card shadow-[0_1px_2px_rgba(0,0,0,.2)] transition-transform duration-200 ease-[cubic-bezier(.3,1.4,.6,1)] data-[state=checked]:translate-x-3.5 data-[state=checked]:bg-white"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
