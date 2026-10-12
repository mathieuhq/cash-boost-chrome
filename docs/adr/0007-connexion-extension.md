# 0007 — Connexion Google de l'extension par code à usage unique

**Statut** : accepté — 2026-10-11

## Décision
- Le side panel demande au service worker de lancer `chrome.identity.launchWebAuthFlow` sur
  `GET /ext/auth/start?redirect_uri=https://<id>.chromiumapp.org/&browser_id=<uuid>`.
- Le backend exécute le flux Google de Better Auth dans cette fenêtre, puis redirige vers
  `https://<id>.chromiumapp.org/#code=<one-time token>` (plugin `oneTimeToken`).
- Le service worker échange le code contre un jeton bearer signé (`POST /ext/auth/exchange`,
  plugin `bearer` avec `requireSignature`) stocké dans `chrome.storage.local`.
- Chaque requête porte `Authorization: Bearer` et `x-super-x-browser` ; un autre navigateur connecté
  depuis → `409 browser_replaced` → déconnexion locale (ActiveBrowser, last-login-wins).
- L'ID de l'extension est fixé par une clé (`CRX_PUBLIC_KEY`) ; le backend n'accepte que les IDs
  d'`EXTENSION_IDS` comme `redirect_uri`.

## Raisons
Aucun cookie tiers, pas de jeton de session dans une URL (code à usage unique), appels possibles depuis
le service worker (alarmes) sans dépendre d'un onglet.
