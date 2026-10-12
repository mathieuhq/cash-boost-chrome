import { describe, expect, it } from "vitest"

import { newLead, nextStep, type Lead } from "./lead"

const base = newLead({
  id: "l1",
  campaignId: "c1",
  author: { id: "u1", handle: "marie", name: "Marie" },
  comment: { id: "t1", text: "GUIDE" },
  matchedBy: "exact",
  at: 1_000,
})

const lead = (patch: Partial<Lead>): Lead => ({ ...base, ...patch })

describe("nextStep (SPEC: traitement d'un lead)", () => {
  it("checks the DMs and sends the lead magnet first", () => {
    expect(nextStep(base, 0)).toEqual({ kind: "dm" })
  })

  it("then likes the comment", () => {
    expect(nextStep(lead({ delivery: "sent" }), 0)).toEqual({ kind: "like" })
  })

  it("then acknowledges publicly that the DM was sent", () => {
    expect(nextStep(lead({ liked: true, delivery: "sent" }), 0)).toEqual({ kind: "reply", ack: "sent" })
  })

  it("likes and acknowledges when the link was already in the DMs", () => {
    expect(nextStep(lead({ delivery: "sent", alreadySent: true }), 0)).toEqual({ kind: "like" })
    expect(nextStep(lead({ liked: true, delivery: "sent", alreadySent: true }), 0)).toEqual({ kind: "reply", ack: "sent" })
  })

  it("likes, then asks to open DMs when they are closed", () => {
    expect(nextStep(lead({ delivery: "dm_closed" }), 0)).toEqual({ kind: "like" })
    expect(nextStep(lead({ liked: true, delivery: "dm_closed" }), 0)).toEqual({ kind: "reply", ack: "dm_closed" })
  })

  it("retries a closed DM once per Tick", () => {
    const closed = lead({ liked: true, delivery: "dm_closed", ack: "dm_closed", lastDmAttemptAt: 5_000 })
    expect(nextStep(closed, 4_000)).toBeNull()
    expect(nextStep(closed, 6_000)).toEqual({ kind: "dm" })
  })

  it("does not reply twice once a retried DM goes through", () => {
    expect(nextStep(lead({ liked: true, delivery: "sent", ack: "dm_closed" }), 0)).toBeNull()
  })

  it("stops on failure or when everything is done", () => {
    expect(nextStep(lead({ delivery: "failed" }), 0)).toBeNull()
    expect(nextStep(lead({ liked: true, delivery: "sent", ack: "sent" }), 0)).toBeNull()
  })
})
