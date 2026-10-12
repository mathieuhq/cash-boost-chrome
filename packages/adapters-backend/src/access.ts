import type { AccessGateway, Clock } from "@super-x/application"
import { Entitlement, MeResponse, type StartTrialRequest } from "@super-x/contracts"

import { BackendError, KEYS, type BackendClient } from "./client"

const HOUR = 3_600_000
/** SPEC: access rechecked every 24 h… */
export const RECHECK_AFTER = 24 * HOUR
/** …and still trusted for 72 h when the backend can't be reached. */
export const TOLERANCE = 72 * HOUR

export interface CachedMe {
  me: MeResponse
  /** When the backend last answered (local clock). */
  checkedAt: number
}

/** A trial whose end has passed is no access, even before the next recheck. */
export function effective(entitlement: Entitlement, now: number): Entitlement {
  if (entitlement.kind === "trial" && entitlement.trialEndsAt !== undefined && entitlement.trialEndsAt <= now) {
    return { ...entitlement, kind: "none" }
  }
  return entitlement
}

export class BackendAccess implements AccessGateway {
  constructor(
    private readonly client: BackendClient,
    private readonly clock: Clock
  ) {}

  /** Fetches /api/me now and caches it. Throws BackendError. */
  async refresh(): Promise<CachedMe> {
    const me = await this.client.request("/api/me", MeResponse)
    const cached: CachedMe = { me, checkedAt: this.clock.now() }
    await this.client.kv.set(KEYS.me, cached)
    return cached
  }

  async cached(): Promise<CachedMe | undefined> {
    return this.client.kv.get<CachedMe>(KEYS.me)
  }

  async current(): Promise<Entitlement | null> {
    if (!(await this.client.session())) return null
    const now = this.clock.now()
    const cached = await this.cached()
    if (cached && now - cached.checkedAt < RECHECK_AFTER) return effective(cached.me.entitlement, now)

    try {
      return effective((await this.refresh()).me.entitlement, now)
    } catch (error) {
      const unreachable = error instanceof BackendError && (error.code === "network" || error.status >= 500)
      if (unreachable && cached && now - cached.checkedAt < TOLERANCE) return effective(cached.me.entitlement, now)
      return null
    }
  }

  async startTrial(xUserId: string): Promise<Entitlement> {
    const entitlement = await this.client.request("/api/trial/start", Entitlement, {
      body: { xUserId } satisfies StartTrialRequest,
    })
    await this.refresh().catch(() => undefined)
    return entitlement
  }
}
