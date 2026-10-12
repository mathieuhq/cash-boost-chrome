import { beforeEach, describe, expect, it } from "vitest"

import { AccessService } from "./access"
import { ClassifyService } from "./classify"
import { AppError } from "./errors"
import {
  FakeClock,
  FakeJev,
  FakeLearnHouse,
  FakeMailer,
  InMemoryAccounts,
  InMemoryPurchases,
  InMemoryStudentCodes,
  InMemoryTrials,
  InMemoryUsage,
} from "./testing/fakes"

let clock: FakeClock
let accounts: InMemoryAccounts
let usage: InMemoryUsage
let jev: FakeJev
let service: ClassifyService

const comments = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, text: `comment ${i}` }))
const code = (promise: Promise<unknown>) => promise.then(() => null, (error: AppError) => [error.code, error.status])

beforeEach(() => {
  clock = new FakeClock()
  accounts = new InMemoryAccounts()
  usage = new InMemoryUsage()
  jev = new FakeJev((text) => (text.endsWith("1") ? 0.9 : 0.1))
  const access = new AccessService({
    accounts,
    purchases: new InMemoryPurchases(),
    trials: new InMemoryTrials(),
    learnhouse: new FakeLearnHouse(),
    codes: new InMemoryStudentCodes(),
    mailer: new FakeMailer(),
    clock,
  })
  service = new ClassifyService({ access, usage, jev, clock, dailyCap: 10 })
  accounts.add({ id: "u1", access: { override: "grant" } })
  accounts.add({ id: "u2" })
})

describe("ClassifyService", () => {
  it("returns one probability per comment, in order, with the remaining quota", async () => {
    const response = await service.classify("u1", { keyword: "GUIDE", comments: comments(3) })
    expect(response).toEqual({
      results: [
        { id: "c0", probability: 0.1 },
        { id: "c1", probability: 0.9 },
        { id: "c2", probability: 0.1 },
      ],
      remainingToday: 7,
    })
    expect(jev.calls[1]).toEqual({ keyword: "GUIDE", comment: "comment 1" })
  })

  it("403 without entitlement", async () => {
    expect(await code(service.classify("u2", { keyword: "GUIDE", comments: comments(1) }))).toEqual([
      "no_entitlement",
      403,
    ])
  })

  it("429 when the batch would exceed the daily cap, and resets the next UTC day", async () => {
    await service.classify("u1", { keyword: "GUIDE", comments: comments(8) })
    expect(await code(service.classify("u1", { keyword: "GUIDE", comments: comments(3) }))).toEqual([
      "classification_cap",
      429,
    ])
    expect((await service.classify("u1", { keyword: "GUIDE", comments: comments(2) })).remainingToday).toBe(0)
    clock.advance(24 * 3_600_000)
    expect((await service.classify("u1", { keyword: "GUIDE", comments: comments(3) })).remainingToday).toBe(7)
  })

  it("502 when Jev fails, without consuming the quota", async () => {
    jev.down = true
    expect(await code(service.classify("u1", { keyword: "GUIDE", comments: comments(5) }))).toEqual([
      "upstream_unavailable",
      502,
    ])
    jev.down = false
    expect((await service.classify("u1", { keyword: "GUIDE", comments: comments(1) })).remainingToday).toBe(9)
  })
})
