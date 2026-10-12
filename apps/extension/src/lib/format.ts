const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "?"
}

export function clock(at: number): string {
  return new Date(at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
}

/** "2 min", "31 h", "2 j" — always rounded up so a deadline never reads as passed early. */
export function duration(ms: number): string {
  if (ms < HOUR) return `${Math.max(1, Math.ceil(ms / MINUTE))} min`
  if (ms < 2 * DAY) return `${Math.ceil(ms / HOUR)} h`
  return `${Math.ceil(ms / DAY)} j`
}

export function plural(count: number, one: string, many: string): string {
  return `${count} ${count > 1 ? many : one}`
}
