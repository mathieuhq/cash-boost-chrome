import { describe, expect, it } from "vitest"

import { decide, DEFAULT_THRESHOLDS } from "./classification"

describe("decide (ADR 0006)", () => {
  it.each([
    [0.8, "accept"],
    [0.98, "accept"],
    [0.79, "review"],
    [0.4, "review"],
    [0.39, "reject"],
    [0, "reject"],
  ] as const)("p=%s → %s", (p, outcome) => {
    expect(decide(p, DEFAULT_THRESHOLDS)).toBe(outcome)
  })
})
