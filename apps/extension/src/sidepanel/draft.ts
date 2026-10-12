import { MAX_TITLE_LENGTH, MAX_VARIANTS, MIN_VARIANTS, parseTweetUrl } from "@super-x/domain"

import type { CampaignDefaults, CampaignDraft, MessageTemplates } from "./model"

export { MAX_TITLE_LENGTH, MAX_VARIANTS, MIN_VARIANTS, parseTweetUrl }
export const DURATIONS = [24, 48, 72] as const

export const DEFAULT_TEMPLATES: MessageTemplates = {
  dm: [
    "Salut, comme promis, voici la ressource :",
    "Hello ! Voici ce que tu as demandé :",
    "Merci pour ton commentaire, voici le lien :",
  ],
  ackSent: [
    "C'est envoyé en DM {@handle} !",
    "Regarde tes DMs {@handle}",
    "Envoyé {@handle} !",
  ],
  ackDmClosed: [
    "{@handle} tes DMs sont fermés : ouvre-les ou suis-moi et je te l'envoie",
    "je n'arrive pas à t'écrire {@handle}, ouvre tes DMs",
    "{@handle} suis-moi pour que je puisse t'envoyer le lien en DM",
  ],
}

export function defaultCampaignDefaults(): CampaignDefaults {
  return {
    templates: {
      dm: [...DEFAULT_TEMPLATES.dm],
      ackSent: [...DEFAULT_TEMPLATES.ackSent],
      ackDmClosed: [...DEFAULT_TEMPLATES.ackDmClosed],
    },
    mustFollow: false,
    durationHours: 48,
  }
}

/** What the user saved in Options, completed with the built-in defaults. */
export function readDefaults(saved: Partial<CampaignDefaults> | undefined): CampaignDefaults {
  return { ...defaultCampaignDefaults(), ...saved }
}

export function emptyDraft(): CampaignDraft {
  return {
    title: "",
    tweetUrl: "",
    keyword: "",
    leadMagnetUrl: "",
    formerLinks: [],
    ...defaultCampaignDefaults(),
  }
}

export type DraftField = "tweetUrl" | "keyword" | "leadMagnetUrl" | "templates"
export type DraftErrors = Partial<Record<DraftField, string>>

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim())
    return url.protocol === "https:" || url.protocol === "http:"
  } catch {
    return false
  }
}

/** Splits a textarea into variants: one per line, blank lines dropped. */
export function toVariants(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

export function validateDraft(draft: CampaignDraft): DraftErrors {
  const errors: DraftErrors = {}
  if (!parseTweetUrl(draft.tweetUrl)) {
    errors.tweetUrl = "Colle l'URL d'un tweet x.com (…/status/…)."
  }
  if (!draft.keyword.trim()) {
    errors.keyword = "Choisis le mot-clé que les gens vont commenter."
  }
  if (!isHttpUrl(draft.leadMagnetUrl)) {
    errors.leadMagnetUrl = "Ajoute le lien de ton lead magnet (https://…)."
  }
  const families = Object.values(draft.templates)
  if (families.some((variants) => variants.length < MIN_VARIANTS || variants.length > MAX_VARIANTS)) {
    errors.templates = `Chaque message demande ${MIN_VARIANTS} à ${MAX_VARIANTS} variantes.`
  }
  return errors
}
