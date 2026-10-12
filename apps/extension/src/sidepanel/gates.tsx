import { AtSign, Zap } from "lucide-react"
import { useId, useState } from "react"

import { EmptyState } from "~components/sx/empty-state"
import { Button } from "~components/ui/button"
import { Input } from "~components/ui/input"
import { Label } from "~components/ui/label"
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

/**
 * The user's OpenRouter key, for Jev. It stays in chrome.storage.local and only goes to openrouter.ai;
 * the panel never reads it back, it only knows whether one is set.
 */
export function OpenRouterKeyForm() {
  const { hasOpenRouterKey } = usePanel()
  const save = useCommand()
  const [key, setKey] = useState("")
  const inputId = useId()

  if (hasOpenRouterKey) {
    return (
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] leading-[14px] font-medium">Clé OpenRouter enregistrée</span>
        <Button
          size="xs"
          variant="ghost"
          disabled={save.busy}
          onClick={() => save.run({ type: "setOpenRouterKey", key: null })}>
          Retirer
        </Button>
      </div>
    )
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={async (event) => {
        event.preventDefault()
        if (await save.run({ type: "setOpenRouterKey", key: key.trim() })) setKey("")
      }}>
      <Label htmlFor={inputId} className="text-[13px] leading-[14px]">
        Clé OpenRouter
      </Label>
      <Input
        id={inputId}
        mono
        required
        type="password"
        autoComplete="off"
        spellCheck={false}
        placeholder="sk-or-…"
        value={key}
        aria-invalid={save.error ? true : undefined}
        onChange={(event) => setKey(event.target.value)}
      />
      <Button size="xs" type="submit" disabled={save.busy || !key.trim()}>
        Enregistrer
      </Button>
      {save.error && <span className="text-xs text-destructive">{save.error}</span>}
    </form>
  )
}
