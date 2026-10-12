import "@fontsource-variable/inter"
import "@fontsource/dm-mono/400.css"
import "@fontsource/dm-mono/500.css"
import "~style.generated.css"

import { Gauge, Inbox, ShieldAlert, TriangleAlert, Users, Zap } from "lucide-react"
import { Tabs as TabsPrimitive } from "radix-ui"
import { useEffect, useId, useRef, useState } from "react"

import { Avatar } from "~components/sx/avatar"
import { Logo } from "~components/sx/logo"
import { NavTiles } from "~components/sx/nav-tiles"
import { notify } from "~components/sx/toast-pill"
import { Alert, AlertActions, AlertDescription, AlertTitle } from "~components/ui/alert"
import { Badge } from "~components/ui/badge"
import { Button } from "~components/ui/button"
import { Checkbox } from "~components/ui/checkbox"
import { Label } from "~components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "~components/ui/popover"
import { Toaster } from "~components/ui/sonner"
import { duration, plural } from "~lib/format"
import { useColorScheme } from "~lib/use-color-scheme"
import { useNow } from "~lib/use-now"

import { errorMessage } from "./errors"
import { ConnectXGate, LoadingGate, PaywallAlert, SignInGate, StudentLinkForm, useCommand } from "./gates"
import type { CircuitBreakerView, PanelState } from "./model"
import { PanelProvider, useEngine, usePanel } from "./store"
import { CampaignsView } from "./views/campaigns-view"
import { LeadsView } from "./views/leads-view"
import { QuotasView } from "./views/quotas-view"
import { ReviewsView } from "./views/reviews-view"

type Section = "campaigns" | "reviews" | "leads" | "quotas"

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

  const accessEnded = state.entitlement.kind === "none" && !state.entitlement.trialAvailable

  return (
    <>
      <header className="flex items-center justify-between gap-2 px-4 py-3">
        <div className="flex items-center gap-2.5 text-[15px] leading-5 font-semibold tracking-[-0.02em]">
          <Logo />
          Cash Boost
        </div>
        <AccountMenu state={state} now={now} />
      </header>

      <TopAlert now={now} accessEnded={accessEnded} />

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
            { id: "quotas", label: "Quotas", icon: Gauge }
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
          <TabsPrimitive.Content value="quotas" className="outline-none">
            <QuotasView />
          </TabsPrimitive.Content>
        </div>
      </TabsPrimitive.Root>
    </>
  )
}

function EntitlementBadge({ state, now }: { state: PanelState; now: number }) {
  const { kind, trialEndsAt } = state.entitlement
  switch (kind) {
    case "trial":
      return (
        <Badge variant="outline" size="sm">
          Essai · {trialEndsAt ? duration(trialEndsAt - now) : "3 j"}
        </Badge>
      )
    case "student":
      return (
        <Badge variant="success" size="sm">
          Élève
        </Badge>
      )
    case "paid":
      return (
        <Badge variant="success" size="sm">
          Licence
        </Badge>
      )
    case "none":
      return state.entitlement.trialAvailable ? (
        <Badge variant="outline" size="sm">
          Essai 3 j
        </Badge>
      ) : (
        <Badge variant="destructive" size="sm">
          Sans accès
        </Badge>
      )
  }
}

/** The avatar opens the account: Google email, access, X handle, student link, sign out. */
function AccountMenu({ state, now }: { state: PanelState; now: number }) {
  const { me } = usePanel()
  const signOut = useCommand()
  return (
    <Popover>
      <PopoverTrigger
        aria-label="Mon compte"
        className="cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Avatar name={me?.account.name || me?.account.email || "?"} src={me?.account.image} />
      </PopoverTrigger>
      <PopoverContent align="end" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[13px] font-medium">{me?.account.email}</span>
            <EntitlementBadge state={state} now={now} />
          </div>
          <span className="text-mono text-muted-foreground">X · @{state.account.handle}</span>
        </div>
        {me?.studentEmail ? (
          <span className="truncate text-xs text-muted-foreground">Achat Growth Boost · {me.studentEmail}</span>
        ) : (
          state.entitlement.kind !== "paid" && <StudentLinkForm />
        )}
        <div className="flex flex-col gap-1">
          <Button size="xs" variant="ghost" disabled={signOut.busy} onClick={() => signOut.run({ type: "signOut" })}>
            Se déconnecter
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

const BREAKER_COPY: Record<CircuitBreakerView["reason"], (code?: string) => [string, string]> = {
  kill_switch: () => [
    "Toutes les campagnes sont arrêtées.",
    "Tu as utilisé l'arrêt d'urgence. Rien ne part tant que tu ne relances pas."
  ],
  x_restriction: (code) => [
    `X a limité ton compte${code ? ` (${code})` : ""}.`,
    "Toutes les campagnes sont en pause. Reprise possible dans 24 h."
  ],
  session_expired: () => [
    "Ta session X a expiré.",
    "Reconnecte-toi sur x.com : les campagnes reprendront au cycle suivant."
  ],
  remote_kill: () => [
    "Cash Boost a suspendu les campagnes.",
    "X a changé quelque chose : on corrige, et tout reprend seul dès que c'est réglé."
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
function TopAlert({ now, accessEnded }: { now: number; accessEnded: boolean }) {
  const { state, send } = useEngine()
  const [understood, setUnderstood] = useState(false)
  const checkboxId = useId()

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

  if (accessEnded) {
    return (
      <div className="px-4 pb-3">
        <PaywallAlert />
      </div>
    )
  }

  if (!state.tosAccepted) {
    return (
      <div className="px-4 pb-3">
        <Alert variant="warning">
          <TriangleAlert />
          <AlertTitle>Cash Boost agit avec ton compte X.</AlertTitle>
          <AlertDescription>
            C'est contraire aux CGU de X : ton compte peut être limité ou suspendu. Les quotas réduisent ce risque, sans
            l'annuler.
          </AlertDescription>
          <AlertActions className="justify-between">
            <div className="flex items-center gap-2">
              <Checkbox id={checkboxId} checked={understood} onCheckedChange={(v) => setUnderstood(v === true)} />
              <Label htmlFor={checkboxId} className="text-xs font-normal">
                J'accepte ce risque
              </Label>
            </div>
            <Button size="xs" disabled={!understood} onClick={() => send({ type: "acceptTos" })}>
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
  const { loaded, signedIn, me, state, send } = usePanel()

  useEffect(() => {
    if (signedIn && !me) send({ type: "refreshAccess" })
    if (signedIn && !state) send({ type: "connectX" })
    // Each time the sign-in state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn])

  return (
    <div className="relative mx-auto min-h-screen w-full max-w-[500px] min-w-[320px] overflow-x-clip bg-background pb-20">
      {!loaded ? <LoadingGate /> : !signedIn ? <SignInGate /> : !state ? <ConnectXGate /> : <SidePanel />}
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
