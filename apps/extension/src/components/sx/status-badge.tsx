import { Badge } from "~components/ui/badge"

type Variant = "brand" | "neutral" | "outline" | "success" | "warning" | "destructive"

const STATUS = {
  active: ["success", "Active", true],
  running: ["success", "En cours", true],
  paused: ["warning", "En pause", false],
  finished: ["neutral", "Terminée", false],
  queued: ["neutral", "En file", false],
  sent: ["success", "DM envoyé", false],
  dm_closed: ["warning", "DM fermé", false],
  failed: ["destructive", "Échec", false],
  pending: ["brand", "À valider", false],
  rejected: ["neutral", "Ignoré", false],
} as const satisfies Record<string, readonly [Variant, string, boolean]>

export type DomainStatus = keyof typeof STATUS

/** Badge preset per domain status; a pulsing dot only on what is running right now. */
export function StatusBadge({
  status,
  size,
  children,
  className,
}: {
  status: DomainStatus
  size?: "default" | "sm"
  children?: React.ReactNode
  className?: string
}) {
  const [variant, label, live] = STATUS[status]
  return (
    <Badge variant={variant} size={size} className={className}>
      {live && <span className="sx-ping sx-ping-success" aria-hidden="true" />}
      {children ?? label}
    </Badge>
  )
}
