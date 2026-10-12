/** A source of numbers in [0, 1), injected so pacing and variant choice stay testable. */
export type Random = () => number

export function between(random: Random, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1))
}
