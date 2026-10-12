import { describe, expect, it } from "vitest"

import { toXError } from "./errors"

describe("toXError", () => {
  it.each([
    [{ status: 429, json: {} }, "restriction", "http_429"],
    [{ status: 200, json: { errors: [{ code: 226, message: "automated" }] } }, "restriction", "x_226"],
    [{ status: 403, json: { errors: [{ code: 326 }] } }, "restriction", "x_326"],
    [{ status: 403, json: { errors: [{ code: 344 }] } }, "restriction", "x_344"],
    [{ status: 401, json: {} }, "session_expired", "http_401"],
    [{ status: 403, json: { errors: [{ code: 349 }] } }, "dm_closed", "x_349"],
    [{ status: 200, json: { errors: [{ code: 144 }] } }, "not_found", "x_144"],
    [{ status: 500, json: {} }, "transient", "http_500"],
  ])("%j → %s", (response, kind, code) => {
    expect(toXError(response)).toMatchObject({ kind, code })
  })

  it("accepts success, including partial GraphQL errors next to data", () => {
    expect(toXError({ status: 200, json: { data: { ok: 1 } } })).toBeNull()
    expect(toXError({ status: 200, json: { data: { ok: 1 }, errors: [{ code: 37 }] } })).toBeNull()
  })
})
