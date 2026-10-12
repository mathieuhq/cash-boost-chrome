import { Progress } from "~components/ui/progress"
import { cn } from "~lib/utils"

/** Consumption of one Quota of the X account. ≥ 80 % turns warning, 100 % destructive with a note. */
export function QuotaMeter({
  label,
  used,
  limit,
  period,
  note,
}: {
  label: string
  used: number
  limit: number
  period?: string
  note?: React.ReactNode
}) {
  const ratio = Math.min(used / Math.max(limit, 1), 1)
  const tone = ratio >= 1 ? "destructive" : ratio >= 0.8 ? "warning" : "brand"
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] leading-[14px] font-medium">{label}</span>
        <span
          className={cn(
            "text-mono text-muted-foreground",
            tone === "warning" && "text-warning",
            tone === "destructive" && "text-destructive"
          )}>
          {used}/{limit}
          {period ? ` · ${period}` : ""}
        </span>
      </div>
      <Progress value={Math.round(ratio * 100)} tone={tone} aria-label={label} />
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  )
}
