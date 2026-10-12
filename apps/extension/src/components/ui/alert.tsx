import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "~lib/utils"

// DS: persistent message at the top of the panel. Title = what happened; description = what happens next.
const alertVariants = cva(
  "relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-xl px-4 py-3 text-sm has-[>svg]:grid-cols-[16px_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-0.5",
  {
    variants: {
      variant: {
        default: "bg-card text-card-foreground shadow-card",
        brand: "bg-card text-card-foreground shadow-card [&>svg]:text-brand-ink",
        warning:
          "bg-warning-soft ring-1 ring-warning/20 [&>svg]:text-warning *:data-[slot=alert-title]:text-warning *:data-[slot=alert-description]:text-foreground",
        destructive:
          "bg-destructive-soft ring-1 ring-destructive/20 [&>svg]:text-destructive *:data-[slot=alert-title]:text-destructive *:data-[slot=alert-description]:text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role={variant === "destructive" ? "alert" : "status"}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn("col-start-2 text-sm leading-5 font-medium", className)}
      {...props}
    />
  )
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "col-start-2 grid justify-items-start gap-1 text-[13px] leading-[18px] text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

function AlertActions({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-actions"
      className={cn("col-start-2 mt-2 flex items-center gap-2", className)}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription, AlertActions }
