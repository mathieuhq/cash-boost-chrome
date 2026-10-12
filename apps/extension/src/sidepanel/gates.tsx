import { AtSign, ShieldAlert, Zap } from "lucide-react"
import { useId, useState } from "react"

import { EmptyState } from "~components/sx/empty-state"
import { Headline } from "~components/sx/headline"
import { Alert, AlertActions, AlertDescription, AlertTitle } from "~components/ui/alert"
import { Button } from "~components/ui/button"
import { Input } from "~components/ui/input"
import { Label } from "~components/ui/label"
import { TEST_AUTH } from "~env"
import type { Command } from "~messages"

import { errorMessage } from "./errors"
import { usePanel } from "./store"

/** Runs a command with a busy flag and its error message. */
export function useCommand() {
  const { send } = usePanel()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const run = async (command: Command) => {
    setBusy(true)
    setError(undefined)
    const result = await send(command)
    setBusy(false)
    if (!result.ok) setError(errorMessage(result.error))
    return result.ok
  }
  return { busy, error, run }
}

function GateLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-6 px-4 pt-6">{children}</div>
}

export function SignInGate() {
  const { replaced } = usePanel()
  const { busy, error, run } = useCommand()
  return (
    <GateLayout>
      <Headline title="Tes lead magnets livrés en DM," accent="pendant que tu postes.">
        Connecte-toi pour lancer ta première campagne. Les élèves Growth Boost ont accès gratuitement ; sinon, 3 jours
        d'essai sans carte.
      </Headline>
      {replaced && (
        <Alert variant="warning">
          <ShieldAlert />
          <AlertTitle>Cash Boost tourne maintenant sur un autre navigateur.</AlertTitle>
          <AlertDescription>
            Une licence vaut pour un navigateur à la fois. Reconnecte-toi ici pour reprendre la main.
          </AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-2">
        <Button block disabled={busy} onClick={() => run({ type: "signIn" })}>
          {busy ? "Connexion…" : TEST_AUTH ? "Se connecter (compte de test)" : "Se connecter avec Google"}
        </Button>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </GateLayout>
  )
}

export function ConnectXGate() {
  const { busy, error, run } = useCommand()
  return (
    <GateLayout>
      <EmptyState
        icon={AtSign}
        title="Connecte ton compte X"
        action={
          <Button size="sm" disabled={busy} onClick={() => run({ type: "connectX" })}>
            {busy ? "Recherche du compte…" : "Détecter mon compte"}
          </Button>
        }>
        Cash Boost agit depuis un onglet x.com où tu es connecté. Ouvre x.com, connecte-toi, puis reviens ici.
      </EmptyState>
      {error && <p className="px-1 text-xs text-destructive">{error}</p>}
    </GateLayout>
  )
}

export function LoadingGate() {
  return (
    <GateLayout>
      <EmptyState icon={Zap} title="Chargement…" />
    </GateLayout>
  )
}

/** Shown above the panel when the Trial is over (or access was revoked): Campaigns are paused, data is kept. */
export function PaywallAlert() {
  const checkout = useCommand()
  const [student, setStudent] = useState(false)
  return (
    <Alert variant="warning">
      <ShieldAlert />
      <AlertTitle>Ton accès est terminé.</AlertTitle>
      <AlertDescription>
        Tes campagnes sont en pause et tes leads restent ici. La licence coûte 99 € une fois, mises à jour comprises.
      </AlertDescription>
      <AlertActions className="justify-between">
        <Button size="xs" variant="ghost" onClick={() => setStudent((open) => !open)}>
          Je suis élève
        </Button>
        <Button size="xs" disabled={checkout.busy} onClick={() => checkout.run({ type: "checkout" })}>
          Licence à vie · 99 €
        </Button>
      </AlertActions>
      {checkout.error && <p className="col-span-full mt-2 text-xs text-destructive">{checkout.error}</p>}
      {student && (
        <div className="col-span-full mt-3">
          <StudentLinkForm />
        </div>
      )}
    </Alert>
  )
}

/**
 * Growth Boost students enter their purchase email, then the code emailed to it; the backend then
 * locks that email to this Account.
 */
export function StudentLinkForm() {
  const request = useCommand()
  const verify = useCommand()
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [sentTo, setSentTo] = useState<string>()
  const inputId = useId()

  if (!sentTo) {
    return (
      <form
        className="flex flex-col gap-1.5"
        onSubmit={async (event) => {
          event.preventDefault()
          const address = email.trim()
          if (await request.run({ type: "linkStudent", email: address })) setSentTo(address)
        }}>
        <Label htmlFor={inputId} className="text-xs">
          Élève Growth Boost ? Ton email d'achat
        </Label>
        <Input
          id={inputId}
          type="email"
          required
          autoComplete="email"
          placeholder="toi@exemple.fr"
          value={email}
          aria-invalid={request.error ? true : undefined}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Button size="xs" type="submit" disabled={request.busy || !email.trim()}>
          {request.busy ? "Vérification…" : "Recevoir un code"}
        </Button>
        {request.error ? (
          <span className="text-xs text-destructive">{request.error}</span>
        ) : (
          <span className="text-center text-xs text-muted-foreground">L'achat sera lié à ce compte Google.</span>
        )}
      </form>
    )
  }

  return (
    <form
      className="flex flex-col gap-1.5"
      onSubmit={(event) => {
        event.preventDefault()
        void verify.run({ type: "verifyStudent", code })
      }}>
      <Label htmlFor={inputId} className="text-xs">
        Code envoyé à {sentTo}
      </Label>
      <Input
        id={inputId}
        mono
        required
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        placeholder="123456"
        className="tracking-[0.3em]"
        value={code}
        aria-invalid={verify.error ? true : undefined}
        onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
      />
      <Button size="xs" type="submit" disabled={verify.busy || code.length !== 6}>
        {verify.busy ? "Vérification…" : "Lier mon achat"}
      </Button>
      {verify.error ? (
        <span className="text-xs text-destructive">{verify.error}</span>
      ) : (
        <span className="text-xs text-muted-foreground">Valable 15 minutes. Pense à regarder tes spams.</span>
      )}
      <Button
        size="xs"
        type="button"
        variant="ghost"
        onClick={() => {
          setSentTo(undefined)
          setCode("")
        }}>
        Changer d'email ou renvoyer le code
      </Button>
    </form>
  )
}
