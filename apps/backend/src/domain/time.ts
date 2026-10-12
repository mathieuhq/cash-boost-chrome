export const MINUTE = 60_000
export const HOUR = 60 * MINUTE
export const DAY = 24 * HOUR

/** UTC calendar day `YYYY-MM-DD`: the unit of the classification cap. */
export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}
