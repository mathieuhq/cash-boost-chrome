import { z } from "zod"

import { UpstreamUnavailable, type LearnHouseGateway } from "../application"

export interface LearnHouseOptions {
  /** e.g. https://learn.example.com (API under /api/v1). */
  baseUrl: string
  /** Admin API token `lh_…` with users.read + usergroups.read. Server-side only. */
  apiToken: string
  orgSlug: string
  /** Growth Boost user groups: a member of any of them is a student. */
  groupUuids: string[]
  fetch?: typeof fetch
  timeoutMs?: number
}

const OrgUser = z.object({ id: z.number() })
const UserGroups = z.array(z.object({ usergroup: z.object({ usergroup_uuid: z.string() }) }))

/** LearnHouse Admin API (docs/research/jev-learnhouse.md, Part 2). */
export class HttpLearnHouse implements LearnHouseGateway {
  private readonly fetchImpl: typeof fetch
  private readonly baseUrl: string

  constructor(private readonly options: LearnHouseOptions) {
    this.fetchImpl = options.fetch ?? ((...args) => fetch(...args))
    this.baseUrl = options.baseUrl.replace(/\/$/, "")
  }

  private async get(path: string): Promise<Response> {
    try {
      return await this.fetchImpl(`${this.baseUrl}/api/v1${path}`, {
        headers: { authorization: `Bearer ${this.options.apiToken}`, accept: "application/json" },
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 8_000),
      })
    } catch {
      throw new UpstreamUnavailable("learnhouse")
    }
  }

  private async json<S extends z.ZodType>(response: Response, schema: S): Promise<z.infer<S>> {
    const parsed = schema.safeParse(await response.json().catch(() => undefined))
    if (!parsed.success) throw new UpstreamUnavailable("learnhouse")
    return parsed.data
  }

  async isMember(email: string): Promise<boolean> {
    const admin = `/admin/${encodeURIComponent(this.options.orgSlug)}`
    // Exact SQL match on LearnHouse's side: callers pass a normalized email.
    const userResponse = await this.get(`${admin}/users/by-email/${encodeURIComponent(email)}`)
    if (userResponse.status === 404) return false
    if (!userResponse.ok) throw new UpstreamUnavailable("learnhouse")
    const { id } = await this.json(userResponse, OrgUser)

    const groupsResponse = await this.get(`${admin}/users/${id}/groups`)
    if (groupsResponse.status === 404) return false
    if (!groupsResponse.ok) throw new UpstreamUnavailable("learnhouse")
    const groups = await this.json(groupsResponse, UserGroups)
    const wanted = new Set(this.options.groupUuids)
    return groups.some((group) => wanted.has(group.usergroup.usergroup_uuid))
  }

}
