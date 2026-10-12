import { Inbox } from "lucide-react"

import { CardStack } from "~components/sx/card-stack"
import { EmptyState } from "~components/sx/empty-state"
import { ReviewCard } from "~components/sx/review-card"
import { SectionHeader } from "~components/sx/section-header"
import { notify } from "~components/sx/toast-pill"

import { useEngine } from "../store"

export function ReviewsView() {
  const { state, send } = useEngine()
  const [review, ...waiting] = state.reviews

  if (!review) {
    return (
      <EmptyState icon={Inbox} title="Rien à valider">
        Quand Jev hésite sur un commentaire, il t'attend ici pour un clic.
      </EmptyState>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader
        title="Commentaires ambigus"
        action={<span className="text-mono text-muted-foreground">{state.reviews.length} en attente</span>}
      />
      <CardStack behind={waiting.length}>
        <ReviewCard
          review={review}
          onApprove={() => {
            send({ type: "approve", reviewId: review.id })
            notify({ people: [review.name], children: `DM en file pour @${review.handle}` })
          }}
          onReject={() => send({ type: "reject", reviewId: review.id })}
        />
      </CardStack>
      <p className="px-1 text-xs text-muted-foreground">
        Jev estime entre 40 et 75 % que ces personnes demandent la ressource. À toi de trancher.
      </p>
    </div>
  )
}
