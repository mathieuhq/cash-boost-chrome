import { Badge } from "~components/ui/badge"
import { cn } from "~lib/utils"

type Variant = "brand" | "neutral" | "outline" | "success" | "warning" | "destructive"

const STATUS = {
  active: ["brand", "Active", true],
  running: ["brand", "En cours", true],
  paused: ["warning", "En pause", false],
  finished: ["neutral", "Terminée", false],
  queued: ["neutral", "En file", false],
  sent: ["success", "DM envoyé", false],
  dm_closed: ["warning", "DM fermé", false],
  failed: ["destructive", "Échec", false],
  pending: ["brand", "À valider", false],
  rejected: ["neutral", "Ignoré", false],
  student: ["success", "Élève", false],
  trial: ["outline", "Essai", false],
  paid: ["success", "Licence", false],
  none: ["destructive", "Sans accès", false],
} as const satisfies Record<string, readonly [Variant, string, boolean]>

export type DomainStatus = keyof typeof STATUS

/** Badge preset per domain status; the beam only on what is running right now. */
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
  const [variant, label, beam] = STATUS[status]
  return (
    <Badge variant={variant} size={size} className={cn(beam && "sx-beam", className)}>
      {children ?? label}
    </Badge>
  )
}
