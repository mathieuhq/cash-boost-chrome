import type { ClassifyRequest, ClassifyResponse } from "@super-x/contracts"

import { utcDay } from "../domain"
import type { AccessService } from "./access"
import { mapLimit } from "./concurrency"
import { AppError } from "./errors"
import { UpstreamUnavailable, type ClassificationUsage, type Clock, type JevGateway } from "./ports"

/** SPEC: 2 000 classifications per user per UTC day. */
export const DAILY_CLASSIFICATION_CAP = 2_000
const CONCURRENCY = 5

export interface ClassifyDeps {
  access: AccessService
  usage: ClassificationUsage
  jev: JevGateway
  clock: Clock
  dailyCap?: number
}

/** Jev proxy. Comment text only passes through: never stored, never logged. */
export class ClassifyService {
  private readonly cap: number

  constructor(private readonly deps: ClassifyDeps) {
    this.cap = deps.dailyCap ?? DAILY_CLASSIFICATION_CAP
  }

  async classify(userId: string, request: ClassifyRequest): Promise<ClassifyResponse> {
    const entitlement = await this.deps.access.entitlement(userId)
    if (entitlement.kind === "none") throw new AppError("no_entitlement", 403)

    const day = utcDay(this.deps.clock.now())
    const count = request.comments.length
    const total = await this.deps.usage.reserve(userId, day, count, this.cap)
    if (total === null) throw new AppError("classification_cap", 429)

    try {
      const results = await mapLimit(request.comments, CONCURRENCY, async (comment) => ({
        id: comment.id,
        probability: Math.min(1, Math.max(0, await this.deps.jev.probability(request.keyword, comment.text))),
      }))
      return { results, remainingToday: Math.max(0, this.cap - total) }
    } catch (error) {
      await this.deps.usage.release(userId, day, count)
      if (error instanceof UpstreamUnavailable) throw new AppError("upstream_unavailable", 502)
      throw error
    }
  }
}
