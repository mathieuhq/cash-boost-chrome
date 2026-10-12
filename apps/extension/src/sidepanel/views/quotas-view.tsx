import { QuotaMeter } from "~components/sx/quota-meter"
import { SectionHeader } from "~components/sx/section-header"
import { Button } from "~components/ui/button"
import { Card, CardDescription } from "~components/ui/card"

import { useEngine } from "../store"

const FULL = "Plafond atteint : les leads attendent dans la file."

export function QuotasView() {
  const { state, send } = useEngine()
  const { dms, likes, replies, tier } = state.quotas

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader
        title="Quotas du compte X"
        action={<span className="text-mono text-muted-foreground">{tier === "premium" ? "Premium" : "Compte gratuit"}</span>}
      />
      <Card>
        <QuotaMeter label="Nouveaux DMs" period="jour" {...dms} note={dms.used >= dms.limit ? FULL : undefined} />
        <QuotaMeter label="Likes" period="heure" {...likes} note={likes.used >= likes.limit ? FULL : undefined} />
        <QuotaMeter label="Réponses" period="jour" {...replies} note={replies.used >= replies.limit ? FULL : undefined} />
      </Card>

      <div className="mt-4">
        <SectionHeader title="Arrêt d'urgence" />
      </div>
      <Card>
        <CardDescription className="text-[13px] leading-[18px]">
          Coupe toutes les campagnes tout de suite. Cash Boost le fait aussi seul dès que X limite ton compte.
        </CardDescription>
        <Button variant="destructive" disabled={!!state.breaker} onClick={() => send({ type: "killSwitch" })}>
          {state.breaker ? "Campagnes arrêtées" : "Tout arrêter"}
        </Button>
      </Card>
    </div>
  )
}
