import { Badge } from "~components/ui/badge"
import { Button } from "~components/ui/button"
import type { PendingReviewView } from "~sidepanel/model"

/** A PendingReview (Jev between 0.4 and 0.8), approved or ignored in one click. */
export function ReviewCard({
  review,
  onApprove,
  onReject,
}: {
  review: PendingReviewView
  onApprove?: () => void
  onReject?: () => void
}) {
  return (
    <article className="flex flex-col gap-3 rounded-xl bg-card p-3 text-card-foreground shadow-card">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate text-[13px] font-medium">{review.name}</span>
          <span className="text-mono truncate text-muted-foreground">@{review.handle}</span>
        </div>
        <Badge variant="brand" size="sm">
          Jev {Math.round(review.probability * 100)} %
        </Badge>
      </div>
      <p className="rounded-lg bg-muted px-3 py-2 text-[13px] leading-[18px]">{review.comment}</p>
      <div className="flex gap-2 *:flex-1">
        <Button size="sm" variant="outline" onClick={onReject}>
          Ignorer
        </Button>
        <Button size="sm" onClick={onApprove}>
          Envoyer le DM
        </Button>
      </div>
    </article>
  )
}
