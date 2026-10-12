import { describe, expect, it } from "vitest"

import { mapLimit } from "./concurrency"

describe("mapLimit", () => {
  it("keeps order and caps parallelism", async () => {
    let running = 0
    let peak = 0
    const result = await mapLimit([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      running++
      peak = Math.max(peak, running)
      await new Promise((resolve) => setTimeout(resolve, 5 - (n % 3)))
      running--
      return n * 2
    })
    expect(result).toEqual([2, 4, 6, 8, 10, 12, 14])
    expect(peak).toBe(3)
  })
})
