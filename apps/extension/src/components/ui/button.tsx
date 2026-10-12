import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "~lib/utils"

// DS: text-only buttons (never an icon), black primary CTA with inner highlight, 1px press.
const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg border border-transparent font-medium whitespace-nowrap transition-[background-color,color,opacity,transform] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-button hover:opacity-90",
        destructive: "bg-destructive text-destructive-foreground shadow-button hover:opacity-90",
        outline: "border-border bg-card text-foreground shadow-xs hover:bg-accent",
        secondary: "bg-secondary text-secondary-foreground hover:opacity-80",
        ghost: "bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
        link: "h-auto bg-transparent p-0 text-brand-ink underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 text-sm",
        sm: "h-8 gap-1.5 rounded-md px-3 text-[13px]",
        xs: "h-7 gap-1 rounded-md px-2.5 text-xs",
      },
      pill: { true: "rounded-full" },
      block: { true: "w-full" },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

// forwardRef: React 18 drops `ref` on plain function components, and Radix triggers (asChild) anchor on it.
const Button = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> &
    VariantProps<typeof buttonVariants> & {
      asChild?: boolean
    }
>(function Button(
  { className, variant = "default", size = "default", pill, block, asChild = false, type = "button", ...props },
  ref
) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      ref={ref}
      data-slot="button"
      data-variant={variant}
      data-size={size}
      type={asChild ? undefined : type}
      className={cn(buttonVariants({ variant, size, pill, block, className }))}
      {...props}
    />
  )
})

export { Button, buttonVariants }
