import { ACTIVE_HOURS, CAMPAIGN_DEFAULTS, ENGINE_CURRENT, engineKey, OPENROUTER_KEY } from "@super-x/adapters-chrome"
import { DEFAULT_CONFIG, type EngineState } from "@super-x/application"
import { createContext, useContext, useEffect, useMemo, useState } from "react"

import { useNow } from "~lib/use-now"
import { send, type Command, type CommandResult } from "~messages"

import { readActiveHours, readDefaults } from "./draft"
import type { ActiveHoursChoice, CampaignDefaults, PanelState } from "./model"
import { project } from "./project"

/** Everything the panel reads from chrome.storage.local; the service worker is the only writer. */
interface Snapshot {
  loaded: boolean
  hasOpenRouterKey: boolean
  defaults: CampaignDefaults
  activeHours: ActiveHoursChoice
  engine?: EngineState
}

async function readSnapshot(): Promise<Snapshot> {
  const base = await chrome.storage.local.get([OPENROUTER_KEY, CAMPAIGN_DEFAULTS, ACTIVE_HOURS, ENGINE_CURRENT])
  const current = base[ENGINE_CURRENT] as string | undefined
  const engine = current ? ((await chrome.storage.local.get(engineKey(current)))[engineKey(current)] as EngineState | undefined) : undefined
  return {
    loaded: true,
    hasOpenRouterKey: !!base[OPENROUTER_KEY],
    defaults: readDefaults(base[CAMPAIGN_DEFAULTS] as Partial<CampaignDefaults> | undefined),
    activeHours: readActiveHours(base[ACTIVE_HOURS]),
    engine,
  }
}

function useSnapshot(): Snapshot {
  const [snapshot, setSnapshot] = useState<Snapshot>({
    loaded: false,
    hasOpenRouterKey: false,
    defaults: readDefaults(undefined),
    activeHours: readActiveHours(undefined),
  })
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
  /** Without it, only Comments with the exact Keyword are processed. */
  hasOpenRouterKey: boolean
  /** Applied to every new Campaign; edited in the Options tab. */
  defaults: CampaignDefaults
  /** Local hours between which the engine works; edited in the Options tab. */
  activeHours: ActiveHoursChoice
  /** null until an X account was detected on x.com. */
  state: PanelState | null
  send: (command: Command) => Promise<CommandResult>
}

const Ctx = createContext<PanelContext | null>(null)

export function PanelProvider({ children }: { children: React.ReactNode }) {
  const snapshot = useSnapshot()
  const now = useNow()

  const value = useMemo<PanelContext>(
    () => ({
      loaded: snapshot.loaded,
      hasOpenRouterKey: snapshot.hasOpenRouterKey,
      defaults: snapshot.defaults,
      activeHours: snapshot.activeHours,
      state: snapshot.engine && snapshot.engine.account.handle ? project(snapshot.engine, { config: DEFAULT_CONFIG, now }) : null,
      send,
    }),
    // `now` ticks every few seconds; projecting is cheap.
    [snapshot, now]
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function usePanel(): PanelContext {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("usePanel must be used inside <PanelProvider>")
  return ctx
}

/** The panel once connected to X; the gates in index.tsx guarantee `state`. */
export function useEngine(): { state: PanelState; send: PanelContext["send"] } {
  const { state, send } = usePanel()
  if (!state) throw new Error("useEngine needs a connected X account")
  return { state, send }
}
