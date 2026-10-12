import type { Random } from "./random"

/** MessageTemplate families (CONTEXT.md): DM, ack "sent", ack "dm_closed". */
export interface MessageTemplates {
  dm: string[]
  ackSent: string[]
  ackDmClosed: string[]
}

export interface Recipient {
  name: string
  handle: string
}

export function firstName(name: string, handle: string): string {
  const word = name.match(/\p{L}[\p{L}\p{M}'’-]*/u)
  return word ? word[0] : handle
}

export function renderTemplate(template: string, to: Recipient): string {
  return template
    .replace(/\{pr[ée]nom\}/giu, firstName(to.name, to.handle))
    .replace(/\{@handle\}/gi, `@${to.handle}`)
}

export type TemplateFamily = keyof MessageTemplates

export function pickVariant<T>(variants: readonly T[], random: Random): T {
  return variants[pickVariantIndex(variants, random)]!
}

/** A variant's index, never `avoid` (the one used last time) when there is a choice. */
export function pickVariantIndex(variants: readonly unknown[], random: Random, avoid?: number): number {
  const count = variants.length
  if (count === 0) throw new Error("pickVariant: no variants")
  if (count === 1 || avoid === undefined || avoid < 0 || avoid >= count) return Math.min(count - 1, Math.floor(random() * count))
  const index = Math.min(count - 2, Math.floor(random() * (count - 1)))
  return index >= avoid ? index + 1 : index
}
