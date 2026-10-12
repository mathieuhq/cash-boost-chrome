# 0004 — Exécution des appels X dans un onglet x.com

**Statut** : accepté — 2026-10-11

## Contexte
Pas d'API officielle. X exige `x-client-transaction-id` (généré par son JS), et des requêtes émises depuis le service worker ont un Origin `chrome-extension://` et une empreinte différente du site — signal de bot.

## Décision
- Les appels aux endpoints internes (`TweetDetail`, `FavoriteTweet`, `CreateTweet`, DM) s'exécutent dans un content script MAIN world sur x.com.
- Le service worker orchestre : alarmes (`chrome.alarms`, ticks idempotents), état dans `chrome.storage.local`, quotas, file.
- Sans onglet x.com ouvert, l'extension ouvre un onglet épinglé en arrière-plan.
- queryIds et features viennent de la Config livrée avec l'extension (ADR 0010), avec repli sur une découverte depuis le trafic de la page.

## Mise à jour (2026-10-12)
X Chat (chiffré E2E) depuis nov. 2025 : l’envoi de DM passe par l’interface XChat, voir ADR 0009.
