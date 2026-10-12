import { XError } from "@super-x/application"

/** X error codes that mean "the account is being limited" → CircuitBreaker (SPEC: anti-ban guards). */
const RESTRICTION_CODES = new Set([88, 185, 226, 326, 344])
const SESSION_CODES = new Set([32, 89, 215, 239])
const NOT_FOUND_CODES = new Set([8, 34, 50, 63, 144, 385, 421])
/** "You cannot send messages to this user" and friends. */
const DM_CLOSED_CODES = new Set([150, 349, 352, 425])

export interface XResponse {
  status: number
  json: unknown
}

function errorCodes(json: unknown): number[] {
  if (!json || typeof json !== "object") return []
  const errors = (json as { errors?: unknown }).errors
  if (!Array.isArray(errors)) return []
  return errors
    .map((e) => {
      const error = (e && typeof e === "object" ? e : {}) as { code?: unknown; extensions?: { code?: unknown } }
      return Number(error.code ?? error.extensions?.code)
    })
    .filter(Number.isFinite)
}

/**
 * Maps an x.com response to an XError, or null when it succeeded. GraphQL often answers 200 with
 * `errors[]`, so codes are checked whatever the status.
 */
export function toXError(response: XResponse): XError | null {
  const codes = errorCodes(response.json)
  const restriction = codes.find((c) => RESTRICTION_CODES.has(c))
  if (response.status === 429 || restriction !== undefined) {
    return new XError("restriction", restriction !== undefined ? `x_${restriction}` : "http_429")
  }
  const session = codes.find((c) => SESSION_CODES.has(c))
  if (response.status === 401 || session !== undefined) {
    return new XError("session_expired", session !== undefined ? `x_${session}` : "http_401")
  }
  const closed = codes.find((c) => DM_CLOSED_CODES.has(c))
  if (closed !== undefined) return new XError("dm_closed", `x_${closed}`)
  const missing = codes.find((c) => NOT_FOUND_CODES.has(c))
  if (response.status === 404 || missing !== undefined) {
    return new XError("not_found", missing !== undefined ? `x_${missing}` : "http_404")
  }
  if (response.status === 403) return new XError("transient", codes[0] ? `x_${codes[0]}` : "http_403")
  if (response.status >= 400) return new XError("transient", `http_${response.status}`)
  if (codes.length && !hasData(response.json)) return new XError("transient", `x_${codes[0]}`)
  return null
}

function hasData(json: unknown): boolean {
  return !!json && typeof json === "object" && "data" in json && !!(json as { data: unknown }).data
}
