// User-facing copy for command errors.
const MESSAGES: Record<string, string> = {
  invalid_tweet_url: "Colle l'URL d'un tweet x.com (…/status/…).",
  invalid_draft: "Vérifie le mot-clé, le lien et les messages.",
  x_not_connected: "Ouvre x.com et connecte-toi à ton compte.",
  x_logged_out: "Connecte-toi sur x.com, puis réessaie.",
  x_unreachable: "x.com ne répond pas. Réessaie dans un instant.",
  tos_not_accepted: "Accepte l'avertissement pour lancer une campagne.",
  breaker_active: "Les campagnes sont à l'arrêt.",
  too_many_campaigns: "3 campagnes en cours au maximum : mets-en une en pause.",
  tweet_not_found: "Ce tweet est introuvable.",
  not_your_tweet: "Ce tweet n'est pas à toi : choisis un tweet du compte connecté.",
  finished: "Cette campagne est terminée.",
  too_early: "X a limité ton compte : attends 24h avant de relancer.",
}

export function errorMessage(code: string): string {
  return MESSAGES[code] ?? "Ça a coincé, réessaie dans un instant."
}
