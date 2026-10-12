// How a person paces themselves on X: short pauses most of the time, a long one now and then,
// bursts of activity separated by breaks, and nights off. Everything here is pure and injectable.
import { between, type Random } from "./random"

/** Local clock hours during which the account is awake: `start` inclusive, `end` exclusive, 0–24. */
export interface ActiveHours {
  start: number
  end: number
  /** The day starts up to this many minutes after `start`, differently every day. */
  jitterMinutes: number
}

export type Range = readonly [number, number]

/**
 * A delay skewed toward the short end: most pauses are brief, a few run long, as a person's do.
 * `random() = 0` gives `min`, `random() → 1` gives `max`; the median sits about a fifth of the way up.
 */
export function skewedBetween(random: Random, [min, max]: Range, shape = 2.2): number {
  return min + Math.round((max - min) * Math.pow(random(), shape))
}

function localHour(at: number): number {
  const date = new Date(at)
  return date.getHours() + date.getMinutes() / 60
}

/** Whether the account is up at `at` (the browser's local time). `start === end` means all day. */
export function isAwake(at: number, hours: ActiveHours): boolean {
  if (hours.start === hours.end) return true
  const hour = localHour(at)
  return hours.start < hours.end ? hour >= hours.start && hour < hours.end : hour >= hours.start || hour < hours.end
}

/** The next moment the account gets up: the coming `start`, pushed by the day's jitter. */
export function nextWakeAt(at: number, hours: ActiveHours, random: Random): number {
  const wake = new Date(at)
  wake.setHours(hours.start, 0, 0, 0)
  if (wake.getTime() <= at) wake.setDate(wake.getDate() + 1)
  return wake.getTime() + between(random, 0, hours.jitterMinutes) * 60_000
}

/** The local calendar day of `at`, as a sortable number (20261012): one daily target per day. */
export function localDay(at: number): number {
  const date = new Date(at)
  return date.getFullYear() * 10_000 + (date.getMonth() + 1) * 100 + date.getDate()
}
