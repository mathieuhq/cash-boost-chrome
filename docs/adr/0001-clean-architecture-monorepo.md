# 0001 — Clean Architecture en monorepo TypeScript

**Statut** : accepté — 2026-10-11

## Décision
Monorepo pnpm + Turborepo, TypeScript partout, organisé selon la Clean Architecture (Robert C. Martin) :

```
packages/domain          entités et règles (Campaign, Lead, Quota…) — zéro dépendance
packages/application     cas d'usage + ports (XGateway, CampaignRepository, Clock, Scheduler, Classifier, AccessChecker…)
packages/adapters-x      adaptateur X (endpoints internes, exécution dans l'onglet x.com)
packages/adapters-chrome stockage, alarmes, messaging Chrome
packages/contracts       types partagés extension ↔ backend
apps/extension           Plasmo (side panel React, background = composition root)
apps/backend             Hono (+ ses propres couches domain/application/adapters)
```

La règle de dépendance (vers l'intérieur uniquement) est vérifiée en CI par dependency-cruiser (ou eslint-plugin-boundaries).

## Conséquences
- Plasmo, Chrome, X, Better Auth, Drizzle, Stripe, OpenRouter restent dans le cercle extérieur, derrière des ports.
- Le cœur est testable sans navigateur ni réseau.
