// User-facing copy for command errors (engine, backend, sign-in).
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
  no_entitlement: "Ton accès a pris fin : passe à la licence pour continuer.",
  finished: "Cette campagne est terminée.",
  too_early: "X a limité ton compte : attends 24 h avant de relancer.",
  remote_kill: "Cash Boost a suspendu les campagnes pour tout le monde. Reprise dès que possible.",
  cancelled: "Connexion annulée.",
  browser_change_limit: "Trop de changements de navigateur cette semaine. Réessaie plus tard.",
  student_not_found: "Aucun achat Growth Boost avec cet email.",
  student_email_taken: "Cet achat est déjà lié à un autre compte. Écris-nous si ce n'est pas toi.",
  student_already_linked: "Ton compte est déjà lié à un autre email d'achat.",
  student_link_limit: "Trop d'essais. Réessaie dans une heure.",
  student_code_invalid: "Code incorrect ou expiré.",
  network: "Serveur injoignable, réessaie plus tard.",
}

export function errorMessage(code: string): string {
  return MESSAGES[code] ?? "Ça a coincé, réessaie dans un instant."
}
