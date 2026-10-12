import "@fontsource-variable/inter"
import "@fontsource/dm-mono/400.css"
import "@fontsource/dm-mono/500.css"
import "~style.generated.css"

import { Inbox, ShieldAlert, SlidersHorizontal, Users, Zap } from "lucide-react"
import { Tabs as TabsPrimitive } from "radix-ui"
import { useEffect, useRef, useState } from "react"

import { Logo } from "~components/sx/logo"
import { NavTiles } from "~components/sx/nav-tiles"
import { notify } from "~components/sx/toast-pill"
import { Alert, AlertActions, AlertDescription, AlertTitle } from "~components/ui/alert"
import { Badge } from "~components/ui/badge"
import { Button } from "~components/ui/button"
import { Toaster } from "~components/ui/sonner"
import { plural } from "~lib/format"
import { useColorScheme } from "~lib/use-color-scheme"
import { useNow } from "~lib/use-now"

import { errorMessage } from "./errors"
import { ConnectXGate, LoadingGate } from "./gates"
import type { CircuitBreakerView, PanelState } from "./model"
import { PanelProvider, useEngine, usePanel } from "./store"
import { CampaignsView } from "./views/campaigns-view"
import { LeadsView } from "./views/leads-view"
import { OptionsView } from "./views/options-view"
import { ReviewsView } from "./views/reviews-view"

type Section = "campaigns" | "reviews" | "leads" | "options"

const RECENT_MS = 10 * 60_000
const RESTRICTION_COOLDOWN = 24 * 3_600_000

function SidePanel() {
  const { state } = useEngine()
  const now = useNow()
  const [section, setSection] = useState<Section>("campaigns")
  const composerRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const recent = state.leads.filter((l) => now - l.at < RECENT_MS)
    if (recent.length > 1) {
      notify({
        people: recent.map((l) => l.name),
        children: plural(recent.length, "nouveau lead", "nouveaux leads")
      })
    }
    // Once per opening of the panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <header className="flex items-center justify-between gap-2 px-4 py-3">
        <div className="flex items-center gap-2.5 text-[15px] leading-5 font-semibold tracking-[-0.02em]">
          <Logo />
          Cash Boost
        </div>
        <XAccountBadge state={state} />
      </header>

      <TopAlert now={now} />

      <TabsPrimitive.Root value={section} onValueChange={(v) => setSection(v as Section)}>
        <NavTiles
          label="Sections"
          items={[
            { id: "campaigns", label: "Campagnes", icon: Zap },
            {
              id: "reviews",
              label: "À valider",
              icon: Inbox,
              count: state.reviews.length
            },
            { id: "leads", label: "Leads", icon: Users },
            { id: "options", label: "Options", icon: SlidersHorizontal }
          ]}
        />
        <div className="px-4 pt-6">
          <TabsPrimitive.Content value="campaigns" className="outline-none">
            <CampaignsView ref={composerRef} now={now} />
          </TabsPrimitive.Content>
          <TabsPrimitive.Content value="reviews" className="outline-none">
            <ReviewsView />
          </TabsPrimitive.Content>
          <TabsPrimitive.Content value="leads" className="outline-none">
            <LeadsView />
          </TabsPrimitive.Content>
          <TabsPrimitive.Content value="options" className="outline-none">
            <OptionsView />
          </TabsPrimitive.Content>
        </div>
      </TabsPrimitive.Root>
    </>
  )
}

/** The connected X account: handle and tier. */
function XAccountBadge({ state }: { state: PanelState }) {
  const premium = state.quotas.tier === "premium"
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="text-mono truncate text-muted-foreground">@{state.account.handle}</span>
      <Badge variant={premium ? "brand" : "outline"} size="sm">
        {premium ? "Premium" : "Gratuit"}
      </Badge>
    </div>
  )
}

const BREAKER_COPY: Record<CircuitBreakerView["reason"], (code?: string) => [string, string]> = {
  kill_switch: () => [
    "Toutes les campagnes sont arrêtées.",
    "Tu as utilisé l'arrêt d'urgence. Rien ne part tant que tu ne relances pas."
  ],
  x_restriction: (code) => [
    `X a limité ton compte${code ? ` (${code})` : ""}.`,
    "Toutes les campagnes sont en pause. Reprise possible dans 24h."
  ],
  session_expired: () => [
    "Ta session X a expiré.",
    "Reconnecte-toi sur x.com : les campagnes reprendront au cycle suivant."
  ],
  xchat_locked: () => [
    "Déverrouille XChat.",
    "XChat demande ton code dans l'onglet x.com épinglé. Tape-le, puis relance les campagnes."
  ],
  xchat_unavailable: () => [
    "X a changé la page des messages.",
    "Toutes les campagnes sont en pause et rien n'est envoyé. On corrige, puis tu pourras relancer."
  ]
}

/** One Alert at a time between the bar and the nav; the destructive one wins. */
function TopAlert({ now }: { now: number }) {
  const { state, send } = useEngine()

  if (state.breaker) {
    const [title, description] = BREAKER_COPY[state.breaker.reason](state.breaker.code)
    const canRestart =
      state.breaker.reason === "kill_switch" ||
      state.breaker.reason === "xchat_locked" ||
      state.breaker.reason === "xchat_unavailable" ||
      (state.breaker.reason === "x_restriction" && now >= state.breaker.at + RESTRICTION_COOLDOWN)
    return (
      <div className="px-4 pb-3">
        <Alert variant="destructive">
          <ShieldAlert />
          <AlertTitle>{title}</AlertTitle>
          <AlertDescription>{description}</AlertDescription>
          {canRestart && (
            <AlertActions>
              <Button
                size="xs"
                onClick={async () => {
                  const result = await send({ type: "restart" })
                  if (!result.ok) notify({ children: errorMessage(result.error) })
                }}>
                Relancer les campagnes
              </Button>
            </AlertActions>
          )}
        </Alert>
      </div>
    )
  }

  if (!state.tosAccepted) {
    return (
      <div className="px-4 pb-3">
        <Alert variant="warning">
          <AlertDescription>
            C'est contraire aux CGU de X : ton compte peut être limité ou suspendu, les quotas réduisent ce risque,
            sans l'annuler.
          </AlertDescription>
          <AlertActions>
            <Button size="xs" block onClick={() => send({ type: "acceptTos" })}>
              Continuer
            </Button>
          </AlertActions>
        </Alert>
      </div>
    )
  }

  return null
}

function Gates() {
  useColorScheme()
  const { loaded, state, send } = usePanel()

  useEffect(() => {
    if (loaded && !state) send({ type: "connectX" })
    // Once the storage is read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded])

  return (
    <div className="relative mx-auto min-h-screen w-full max-w-[500px] min-w-[320px] overflow-x-clip bg-background pb-20">
      {!loaded ? <LoadingGate /> : !state ? <ConnectXGate /> : <SidePanel />}
      <Toaster />
    </div>
  )
}

export default function SidePanelRoot() {
  return (
    <PanelProvider>
      <Gates />
    </PanelProvider>
  )
}
