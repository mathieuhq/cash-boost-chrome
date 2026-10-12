/** A link as compared in DMs: no scheme, no `www.`, no tracking parameters, no trailing slash, lower-case host. */
export function normalizeLink(value: string): string | null {
  const raw = value.trim()
  if (!raw) return null
  let url: URL
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`)
  } catch {
    return null
  }
  const tracking: string[] = []
  url.searchParams.forEach((_, key) => {
    if (/^(utm_|fbclid$|gclid$|ref$|s$)/i.test(key)) tracking.push(key)
  })
  for (const key of tracking) url.searchParams.delete(key)
  const host = url.hostname.toLowerCase().replace(/^www\./, "")
  const path = url.pathname.replace(/[.,;:!?]+$/, "").replace(/\/+$/, "")
  const query = url.searchParams.toString()
  return `${host}${path}${query ? `?${query}` : ""}`
}

/** The lead magnet link and its earlier versions, normalized and deduplicated. */
export function campaignLinks(campaign: { leadMagnetUrl: string; formerLinks?: string[] }): string[] {
  const links = [campaign.leadMagnetUrl, ...(campaign.formerLinks ?? [])].map(normalizeLink)
  return [...new Set(links.filter((l): l is string => l !== null))]
}

/** True when `text` contains one of the normalized `links`. */
export function containsLink(text: string, links: readonly string[]): boolean {
  const found = text.match(/(?:https?:\/\/)?(?:[\w-]+\.)+[a-z]{2,}(?:\/[^\s<>"')]*)?/gi) ?? []
  const normalized = new Set(found.map(normalizeLink))
  return links.some((l) => normalized.has(l))
}
