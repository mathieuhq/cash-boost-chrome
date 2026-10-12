# 0010 — Extension gratuite, sans backend ni compte

**Statut** : accepté — 2026-10-12 (remplace les ADR 0005, 0007 et 0008)

## Contexte
Le dépôt est public (MIT) et l'extension doit être gratuite pour tout le monde. Le backend (ADR 0005) ne servait qu'à la connexion Google, aux licences Stripe, à la vérification des élèves LearnHouse, à la config distante et au proxy Jev. Il fallait exploiter et payer Google OAuth, Neon, Vercel, Stripe, Resend et LearnHouse, et maintenir une page admin, pour une extension désormais gratuite.

## Décision
- Plus de backend : `apps/backend`, `packages/adapters-backend` et `packages/contracts` sont supprimés. Plus de compte, d'Entitlement, d'essai, d'ActiveBrowser, de StudentLink ni de paywall.
- Jev (`typesafe/jev-1.13`, OpenRouter Decisions API, même question qu'avant, texte du commentaire seulement dans `state` comme une donnée) est appelé **directement par l'extension**, avec la **clé OpenRouter de l'utilisateur** (`packages/adapters-openrouter`).
- La clé est collée dans le side panel (onglet Options, champ « Clé OpenRouter »), stockée seulement dans `chrome.storage.local` (`openrouter:key`) et envoyée seulement à openrouter.ai.
- Sans clé : les commentaires qui contiennent le mot-clé sont traités ; les autres ne sont pas classés et attendent, repris à chaque Tick une fois la clé saisie. Plus de plafond de classifications. Seuils inchangés (≥ 0,8 accepté, 0,4–0,8 PendingReview, < 0,4 rejeté).
- La RemoteConfig devient une constante `DEFAULT_CONFIG` (type `Config`) dans `packages/application/src/config.ts` : seuils, plafonds par AccountTier, cadence, queryIds et features X, `dmMode`, repères XChat. Ni `version` ni kill switch distant ; la raison `remote_kill` du CircuitBreaker disparaît. L'arrêt d'urgence local reste.
- Plus de remontée des codes d'erreur X.
- Manifest : permission `identity` et hôte du backend retirés, `https://openrouter.ai/*` ajouté. Plus d'ID d'extension fixe (`CRX_PUBLIC_KEY`, `pnpm key`, `.env.example`), qui n'existait que pour le backend.
- `pnpm dev` ne lance plus que l'extension en watch (plus de mode `--test`).

## Conséquences
- Plus de kill switch central ni de correctif de config à chaud : un changement côté X (queryIds, repères XChat) demande de publier une nouvelle version.
- Chaque utilisateur paie son propre usage de Jev ; aucun plafond côté serveur.
- Plus de télémétrie : une casse côté X ne se voit que par les retours des utilisateurs.
- Le texte des commentaires sans mot-clé va du navigateur directement à OpenRouter, sans intermédiaire.
- La clé OpenRouter vit dans l'extension, alors qu'OpenRouter recommande de la garder côté serveur : c'est la clé de l'utilisateur, sur son navigateur.
- Aucune licence à faire respecter : n'importe qui peut installer, modifier ou republier l'extension.
