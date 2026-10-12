import type { MeResponse } from "@super-x/contracts"
import { beforeEach, describe, expect, it } from "vitest"

import { BackendAccess, RECHECK_AFTER, TOLERANCE } from "./access"
import { BackendClient, KEYS, type KeyValue } from "./client"
import { BackendClassifier } from "./services"

class MapKv implements KeyValue {
  map = new Map<string, unknown>()
  async get<T>(key: string) {
    return this.map.get(key) as T | undefined
  }
  async set(key: string, value: unknown) {
    this.map.set(key, value)
  }
  async remove(key: string) {
    this.map.delete(key)
  }
}

const me = (kind: MeResponse["entitlement"]["kind"], trialEndsAt?: number): MeResponse => ({
  account: { id: "a1", email: "a@b.c", name: "A", role: "user" },
  entitlement: { kind, trialAvailable: false, ...(trialEndsAt ? { trialEndsAt } : {}) },
  studentEmail: null,
  checkedAt: 0,
})

let kv: MapKv
let time: number
let respond: () => Response | Promise<Response>
let requests: Request[]

function setup() {
  const client = new BackendClient({
    baseUrl: "https://api.test",
    kv,
    newId: () => "browser-1",
    fetch: async (input, init) => {
      requests.push(new Request(input, init))
      return respond()
    },
  })
  return { client, access: new BackendAccess(client, { now: () => time }) }
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

beforeEach(async () => {
  kv = new MapKv()
  time = 1_000_000_000
  requests = []
  respond = () => json(me("student"))
  await kv.set(KEYS.session, { token: "tok" })
})

describe("BackendAccess", () => {
  it("is null when signed out", async () => {
    await kv.remove(KEYS.session)
    expect(await setup().access.current()).toBeNull()
  })

  it("sends the bearer token and the browser id", async () => {
    await setup().access.current()
    expect(requests[0]!.headers.get("authorization")).toBe("Bearer tok")
    expect(requests[0]!.headers.get("x-super-x-browser")).toBe("browser-1")
  })

  it("rechecks after 24 h only", async () => {
    const { access } = setup()
    await access.current()
    time += RECHECK_AFTER - 1
    await access.current()
    expect(requests).toHaveLength(1)
    time += 2
    await access.current()
    expect(requests).toHaveLength(2)
  })

  it("keeps the last answer for 72 h when the backend is unreachable", async () => {
    const { access } = setup()
    await access.current()
    respond = () => {
      throw new TypeError("offline")
    }
    time += TOLERANCE - 1
    expect((await access.current())?.kind).toBe("student")
    time += 2
    expect(await access.current()).toBeNull()
  })

  it("ends a trial at its end date without waiting for the recheck", async () => {
    respond = () => json(me("trial", time + 1_000))
    const { access } = setup()
    expect((await access.current())?.kind).toBe("trial")
    time += 1_000
    expect((await access.current())?.kind).toBe("none")
  })

  it("signs out when another browser took over", async () => {
    respond = () => json({ error: "browser_replaced" }, 409)
    const { access } = setup()
    expect(await access.current()).toBeNull()
    expect(kv.map.has(KEYS.session)).toBe(false)
    expect(kv.map.get(KEYS.replaced)).toBe(true)
  })
})

describe("BackendClassifier", () => {
  it("maps the daily cap to ClassifierUnavailable('cap')", async () => {
    respond = () => json({ error: "classification_cap" }, 429)
    const { client } = setup()
    await expect(new BackendClassifier(client).classify("GUIDE", [{ id: "1", text: "x" }])).rejects.toMatchObject({
      reason: "cap",
    })
  })
})
