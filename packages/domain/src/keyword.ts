/**
 * Local Keyword filter (ADR 0006, step 1): case, accents, emojis and punctuation are ignored,
 * and the Keyword must appear as whole words so "guides" goes to Jev instead of matching "guide".
 */
export function normalizeText(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/@\w+/g, " ")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
}

export function matchesKeyword(comment: string, keyword: string): boolean {
  const needle = normalizeText(keyword)
  if (!needle) return false
  return ` ${normalizeText(comment)} `.includes(` ${needle} `)
}
