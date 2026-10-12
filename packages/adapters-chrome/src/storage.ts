import { emptyState, type EngineState, type StateStore, type XAccount } from "@super-x/application"

/** Minimal persistent key-value store (chrome.storage.local in the extension, a Map in tests). */
export interface KeyValue {
  get<T>(key: string): Promise<T | undefined>
  set(key: string, value: unknown): Promise<void>
  remove(key: string): Promise<void>
}

export const chromeKv: KeyValue = {
  async get<T>(key: string) {
    const items = await chrome.storage.local.get(key)
    return items[key] as T | undefined
  },
  async set(key, value) {
    await chrome.storage.local.set({ [key]: value })
  },
  async remove(key) {
    await chrome.storage.local.remove(key)
  },
}

/** The user's OpenRouter key: stays in chrome.storage.local, only ever sent to openrouter.ai. */
export const OPENROUTER_KEY = "openrouter:key"

/** Messages, duration and follow rule applied to new Campaigns (Options tab). */
export const CAMPAIGN_DEFAULTS = "options:campaignDefaults"

/** `{ start, end }` local hours chosen in the Options tab; overrides the Config's active hours (ADR 0011). */
export const ACTIVE_HOURS = "options:activeHours"

/** `{ enabled, days }` chosen in the Options tab; overrides the Config's ramp-up (ADR 0011). */
export const RAMP_UP = "options:rampUp"

export const ENGINE_CURRENT = "engine:current"
export const engineKey = (accountId: string) => `engine:${accountId}`

/** One EngineState per X account ("rangé par handle X", SPEC), in chrome.storage.local only. */
export class ChromeStateStore implements StateStore {
  constructor(private readonly kv: KeyValue = chromeKv) {}

  async currentAccountId() {
    return (await this.kv.get<string>(ENGINE_CURRENT)) ?? null
  }

  async load(accountId: string): Promise<EngineState> {
    const saved = await this.kv.get<EngineState>(engineKey(accountId))
    const placeholder: XAccount = { id: accountId, handle: "", name: "", tier: "free" }
    return saved ?? emptyState(placeholder)
  }

  async save(state: EngineState) {
    await chrome.storage.local.set({ [engineKey(state.account.id)]: state, [ENGINE_CURRENT]: state.account.id })
  }
}
