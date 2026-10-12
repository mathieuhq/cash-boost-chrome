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

export function pickVariant<T>(variants: readonly T[], random: Random): T {
  if (variants.length === 0) throw new Error("pickVariant: no variants")
  return variants[Math.min(variants.length - 1, Math.floor(random() * variants.length))]!
}
