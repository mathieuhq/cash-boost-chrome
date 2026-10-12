import { effective, KEYS, type CachedMe } from "@super-x/adapters-backend"
import { ENGINE_CURRENT, engineKey } from "@super-x/adapters-chrome"
import type { EngineState } from "@super-x/application"
import { DEFAULT_REMOTE_CONFIG, type MeResponse, type RemoteConfig } from "@super-x/contracts"
import { createContext, useContext, useEffect, useMemo, useState } from "react"

import { useNow } from "~lib/use-now"
import { send, type Command, type CommandResult } from "~messages"

import type { PanelState } from "./model"
import { project } from "./project"

/** Everything the panel reads from chrome.storage.local; the service worker is the only writer. */
interface Snapshot {
  loaded: boolean
  signedIn: boolean
  replaced: boolean
  me?: CachedMe
  config: RemoteConfig
  engine?: EngineState
}

async function readSnapshot(): Promise<Snapshot> {
  const base = await chrome.storage.local.get([KEYS.session, KEYS.replaced, KEYS.me, KEYS.config, ENGINE_CURRENT])
  const current = base[ENGINE_CURRENT] as string | undefined
  const engine = current ? ((await chrome.storage.local.get(engineKey(current)))[engineKey(current)] as EngineState | undefined) : undefined
  return {
    loaded: true,
    signedIn: !!base[KEYS.session],
    replaced: base[KEYS.replaced] === true,
    me: base[KEYS.me] as CachedMe | undefined,
    config: (base[KEYS.config] as { config: RemoteConfig } | undefined)?.config ?? DEFAULT_REMOTE_CONFIG,
    engine,
  }
}

function useSnapshot(): Snapshot {
  const [snapshot, setSnapshot] = useState<Snapshot>({ loaded: false, signedIn: false, replaced: false, config: DEFAULT_REMOTE_CONFIG })
  useEffect(() => {
    let alive = true
    const refresh = () => readSnapshot().then((s) => alive && setSnapshot(s))
    refresh()
    const onChanged = (_changes: unknown, area: string) => area === "local" && refresh()
    chrome.storage.onChanged.addListener(onChanged)
    return () => {
      alive = false
      chrome.storage.onChanged.removeListener(onChanged)
    }
  }, [])
  return snapshot
}

interface PanelContext {
  loaded: boolean
  signedIn: boolean
  /** Signed out because another browser signed in (last-login-wins). */
  replaced: boolean
  me?: MeResponse
  /** null until an X account was detected on x.com. */
  state: PanelState | null
  send: (command: Command) => Promise<CommandResult>
}

const Ctx = createContext<PanelContext | null>(null)

export function PanelProvider({ children }: { children: React.ReactNode }) {
  const snapshot = useSnapshot()
  const now = useNow()
  const entitlement = snapshot.me ? effective(snapshot.me.me.entitlement, now) : null

  const value = useMemo<PanelContext>(
    () => ({
      loaded: snapshot.loaded,
      signedIn: snapshot.signedIn,
      replaced: snapshot.replaced,
      ...(snapshot.me ? { me: { ...snapshot.me.me, ...(entitlement ? { entitlement } : {}) } } : {}),
      state: snapshot.engine && snapshot.engine.account.handle ? project(snapshot.engine, { entitlement, config: snapshot.config, now }) : null,
      send,
    }),
    // `now` ticks every few seconds; projecting is cheap.
    [snapshot, now, entitlement?.kind]
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function usePanel(): PanelContext {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("usePanel must be used inside <PanelProvider>")
  return ctx
}

/** The panel once signed in and connected to X; the gates in index.tsx guarantee `state`. */
export function useEngine(): { state: PanelState; send: PanelContext["send"] } {
  const { state, send } = usePanel()
  if (!state) throw new Error("useEngine needs a connected X account")
  return { state, send }
}
