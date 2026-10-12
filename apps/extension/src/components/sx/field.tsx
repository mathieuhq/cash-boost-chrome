import { cloneElement, useId } from "react"

import { Label } from "~components/ui/label"

/** Label + one control + description or error; wires id, htmlFor and aria attributes. */
export function Field({
  label,
  description,
  error,
  children,
}: {
  label: React.ReactNode
  description?: React.ReactNode
  error?: React.ReactNode
  children: React.ReactElement<Record<string, unknown>>
}) {
  const id = useId()
  const describedBy = error ? `${id}-err` : description ? `${id}-desc` : undefined
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {cloneElement(children, {
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
      })}
      {error ? (
        <p id={`${id}-err`} className="text-xs text-destructive">
          {error}
        </p>
      ) : description ? (
        <p id={`${id}-desc`} className="text-xs text-muted-foreground">
          {description}
        </p>
      ) : null}
    </div>
  )
}

/** Inline `{prénom}` / `{@handle}` variable chip. */
export function Var({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-[4px] bg-brand-soft px-1 font-mono text-xs text-brand-ink">{children}</code>
  )
}
