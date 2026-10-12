# Cash Boost — backend

API de l'extension (Hono + Better Auth + Drizzle/Postgres), déployée sur Vercel (région `cdg1`).
Décisions : `docs/adr/0005-backend-hono-vercel.md`, faits vérifiés : `docs/research/backend-auth-stripe.md` et `docs/research/jev-learnhouse.md`.

## Architecture

```
src/domain/        règles pures : Entitlement, Trial, ActiveBrowser (3 changements / 7 jours), revérification élève (24 h / 72 h)
src/application/   cas d'usage + ports (AccessService, ClassifyService, BillingService, ConfigService, AdminService)
src/adapters/      Drizzle (Neon / PGlite), Better Auth, LearnHouse, OpenRouter (Jev), Stripe
src/http/          routes Hono, middlewares, pages HTML (admin, paiement)
src/main.ts        composition root : createBackend(env, db) → { app, auth } (injection manuelle, ADR 0002)
src/dev.ts         serveur local (@hono/node-server)
src/vercel.ts      entrée de la Vercel Function (bundlée par scripts/build.ts)
drizzle/           migrations SQL générées par drizzle-kit
```

## Commandes

| Commande | Effet |
|---|---|
| `pnpm dev` | serveur local sur `http://localhost:8787` (tsx watch). Sans `DATABASE_URL` : base PGlite dans `.data/pglite`, migrations appliquées au démarrage |
| `pnpm test` | Vitest : domaine et cas d'usage avec des fakes, repos Drizzle et routes HTTP sur PGlite. Aucun service externe appelé |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm db:generate` | génère une migration SQL dans `drizzle/` après modification de `src/adapters/db/schema.ts` |
| `pnpm db:migrate` | applique `drizzle/` sur `DATABASE_URL` (Neon), ou sur la base PGlite locale si elle est vide |
| `pnpm build` | bundle esbuild → `.vercel/output` (Build Output API, voir « Déploiement ») |

## Variables d'environnement

Toutes sont décrites dans `.env.example` (à copier en `.env` pour `pnpm dev`). En production (Vercel), l'absence d'une variable obligatoire fait échouer le démarrage ; en local, les fonctionnalités correspondantes sont simplement indisponibles.

| Variable | Rôle |
|---|---|
| `BETTER_AUTH_URL` | URL publique du backend, sans `/` final |
| `BETTER_AUTH_SECRET` | secret ≥ 32 caractères (`openssl rand -base64 32`) : sessions, tokens bearer signés, cookies |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | client OAuth Google |
| `EXTENSION_IDS` | ids d'extension Chrome séparés par des virgules (origines de confiance, CORS, `redirect_uri` autorisés) |
| `ADMIN_EMAILS` | emails qui reçoivent le rôle admin à la connexion |
| `DATABASE_URL` | URL Neon (obligatoire en production) |
| `PGLITE_DIR` | dossier de la base PGlite locale (défaut `.data/pglite`) |
| `OPENROUTER_API_KEY`, `JEV_MODEL` | clé OpenRouter et version épinglée de Jev (`typesafe/jev-1.13`) |
| `LEARNHOUSE_URL`, `LEARNHOUSE_API_TOKEN`, `LEARNHOUSE_ORG_SLUG`, `LEARNHOUSE_GROUP_UUIDS` | vérification élève |
| `RESEND_API_KEY`, `MAIL_FROM` | envoi du code de liaison élève (vide en dev : le code s'affiche dans la console) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` | paiement |
| `PORT` | port local (défaut 8787) |

## Développement local

```bash
cp .env.example .env      # renseigner au minimum BETTER_AUTH_SECRET
pnpm install              # à la racine du monorepo
pnpm --filter @super-x/backend dev
```

Pour tester la connexion Google en local, ajoute `http://localhost:8787/api/auth/callback/google` aux URI de redirection du client OAuth. L'extension chargée en mode développeur doit avoir son id dans `EXTENSION_IDS` et pointer sur `http://localhost:8787`.

## Base de données (Neon) et migrations

1. Vercel → Storage → Marketplace → **Neon**, région **Frankfurt (`aws-eu-central-1`)** ou Londres (Neon n'a pas de région Paris). La variable `DATABASE_URL` est ajoutée au projet.
2. Après chaque modification du schéma : `pnpm db:generate`, puis vérifier le SQL généré dans `drizzle/`.
3. Appliquer les migrations avant de déployer le code qui en dépend :
   ```bash
   DATABASE_URL="postgresql://…" pnpm --filter @super-x/backend db:migrate
   ```

Tables : celles de Better Auth (`user` avec la colonne `role`, `session`, `account`, `verification`) et `access`, `trials`, `purchases`, `classification_usage`, `remote_config`, `error_counts`.

## Client OAuth Google

1. Google Cloud Console → nouveau projet (ex. « Cash Boost »).
2. **Google Auth Platform → Branding** : nom de l'app, email d'assistance, domaine du backend, liens vers la politique de confidentialité et les CGU.
3. **Audience** : type *External*, puis **Publier l'application** (statut *In production*). En mode *Testing*, seuls les utilisateurs de test déclarés peuvent se connecter. Les scopes `openid`, `email` et `profile` ne sont pas sensibles et ne demandent pas de vérification approfondie.
4. **Clients → Créer un client** : type *Web application*.
   - **URI de redirection autorisés** : `<BETTER_AUTH_URL>/api/auth/callback/google` (et `http://localhost:8787/api/auth/callback/google` pour le local).
   - Aucune origine JavaScript n'est nécessaire.
5. Copier l'id et le secret dans `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

## Déploiement Vercel

Le zero-config Hono de Vercel ne bundle pas l'application (« does not perform application bundling », doc Vercel Express/Hono) et son mode par défaut exige des extensions de fichier dans les imports relatifs. Or `@super-x/contracts` est publié en source TypeScript (`exports: ./src/index.ts`) et le code utilise des imports sans extension. **Le build bundle donc tout avec esbuild** et écrit directement une sortie [Build Output API v3](https://vercel.com/docs/build-output-api) :

```
.vercel/output/config.json                      toutes les routes → /index
.vercel/output/functions/index.func/index.mjs   bundle ESM (handler Node (req, res) via @hono/node-server)
.vercel/output/functions/index.func/.vc-config.json   nodejs24.x, région cdg1, maxDuration 60 s
```

Configuration du projet Vercel :

1. **Root Directory** : `apps/backend` (Vercel installe les dépendances à la racine du monorepo pnpm).
2. **Framework Preset** : *Other* (`vercel.json` force `"framework": null` et `"buildCommand": "pnpm build"`).
3. **Node.js Version** : 24.x.
4. Renseigner les variables d'environnement (Production et Preview).
5. Appliquer les migrations (`pnpm db:migrate`), puis déployer (push Git ou `vercel deploy`). Alternative déterministe : `vercel build && vercel deploy --prebuilt`.

Vérification : `GET <BETTER_AUTH_URL>/healthz` → `{"ok":true}`.

## Stripe (paiement unique + Stripe Tax)

1. **Produit** : Catalogue → « Cash Boost — accès à vie ».
2. **Prix** : paiement unique, 99 USD avec une option de devise EUR à 99 €, **`tax_behavior` inclusive** (prix TTC) sur chaque devise — sinon Checkout retombe sur la devise par défaut. Copier l'id `price_…` dans `STRIPE_PRICE_ID`.
3. **Stripe Tax** : activer Tax, renseigner l'adresse de l'entreprise, ajouter les **enregistrements** (Tax → Registrations) des juridictions où la taxe doit être collectée, et choisir un code fiscal de produit numérique/logiciel. La session Checkout active `automatic_tax` et exige l'adresse de facturation.
4. **Webhook** : Developers → Webhooks → endpoint `<BETTER_AUTH_URL>/api/stripe/webhook`, version d'API `2026-09-30.endive` (celle de stripe-node 23), événements :
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `charge.refunded` (un remboursement **total** révoque la licence)

   Copier le secret de signature `whsec_…` dans `STRIPE_WEBHOOK_SECRET`.
5. Pages de retour servies par le backend : `/checkout/success` et `/checkout/cancel`.

Test local : `stripe listen --forward-to localhost:8787/api/stripe/webhook` (le CLI affiche un `whsec_…` temporaire).

## LearnHouse (vérification élève)

1. Sur `learn.example.com` : Dashboard → **Developers → API** (`/dash/developers/api`) → créer un token.
2. Droits minimum : **Users (Admin API) → read** (`users.action_read`) et **User groups → read** (`usergroups.action_read`). Le token `lh_…` n'est affiché qu'une fois : le mettre dans `LEARNHOUSE_API_TOKEN`. La réponse de création contient aussi l'`org_id` numérique.
3. **UUID du groupe Growth Boost** : avec le token,
   ```bash
   curl -H "Authorization: Bearer lh_…" https://learn.example.com/api/v1/usergroups/org/<org_id>
   # ou les groupes liés au cours :
   curl -H "Authorization: Bearer lh_…" https://learn.example.com/api/v1/usergroups/resource/<course_uuid>
   ```
   Reporter le champ `usergroup_uuid` dans `LEARNHOUSE_GROUP_UUIDS` (plusieurs valeurs séparées par des virgules si besoin).
4. `LEARNHOUSE_ORG_SLUG` vaut `my-school` (`GET /api/v1/instance/info`).

L'appartenance est vérifiée via `GET /api/v1/admin/{org}/users/by-email/{email}` puis `…/users/{id}/groups` (limite LearnHouse : 60 requêtes / min / token). Un compte non élève est revérifié à chaque `/api/me`, un élève toutes les 24 h, avec une tolérance de 72 h si LearnHouse est injoignable.

Liaison (ADR 0008) : l'élève saisit son email d'achat (`POST /api/student/link`, 5 demandes / heure), reçoit un code à 6 chiffres par Resend (15 min, hash seul en base) et le saisit (`POST /api/student/verify`, 5 essais). L'email est ensuite verrouillé sur le compte (index unique `access_student_email_unique`) : un autre compte reçoit `409 student_email_taken`. Seul l'admin peut délier.

## Admin

`<BETTER_AUTH_URL>/admin` → connexion Google (session cookie). Seuls les comptes `role = admin` (emails de `ADMIN_EMAILS`) y accèdent ; les autres reçoivent une 403.

- **Utilisateurs** : email, statut (élève / essai / payé / aucun), navigateur actif, dernière vérification élève, boutons *Accorder* / *Retirer* / *Réinitialiser* (override manuel), email d'achat Growth Boost lié avec un bouton *Délier*.
- **Config distante** : éditeur JSON validé par le schéma `RemoteConfig` ; chaque enregistrement crée une nouvelle version (numéro attribué par le serveur).
- **Erreurs** : codes d'erreur X remontés par l'extension, par version de config.

Les formulaires POST sont protégés par une vérification same-origin (`Origin` / `Sec-Fetch-Site`).

## Connexion depuis l'extension

Pas de cookies tiers : tout passe par `chrome.identity.launchWebAuthFlow` puis un token bearer signé.

1. `chrome.identity.launchWebAuthFlow({ url: "<API>/ext/auth/start?redirect_uri=<chrome.identity.getRedirectURL()>&browser_id=<uuid>", interactive: true })`
2. Fin du flux : `https://<id>.chromiumapp.org/#code=<code>` (ou `#error=<code>`).
3. `POST <API>/ext/auth/exchange` avec `{ "code", "browserId" }` → `{ "token" }` (contrats `AuthExchangeRequest` / `AuthExchangeResponse`).
4. Chaque appel : `Authorization: Bearer <token>` et `x-super-x-browser: <browserId>`.
5. Déconnexion : `POST <API>/api/auth/sign-out` avec le bearer.

## API

| Route | Auth | Réponse |
|---|---|---|
| `GET /healthz` | — | `{ ok: true }` |
| `GET /api/config` | — | `RemoteConfig` (défaut version 0) |
| `GET /api/me` | bearer + navigateur | `MeResponse` |
| `POST /api/trial/start` | bearer + navigateur | `Entitlement` ; 409 `trial_used` |
| `POST /api/classify` | bearer + navigateur | `ClassifyResponse` ; 403 `no_entitlement`, 429 `classification_cap`, 502 `upstream_unavailable` |
| `POST /api/errors` | bearer + navigateur | `{ ok: true }` |
| `POST /api/checkout` | bearer + navigateur | `CheckoutResponse` ; 409 `invalid_request` / `already_paid` |
| `POST /api/student/link` | bearer + navigateur | body `{ email }` → `{ email, expiresAt }` (code envoyé) ; 404 `student_not_found`, 409 `student_email_taken` / `student_already_linked`, 429 `student_link_limit`, 502 `upstream_unavailable` |
| `POST /api/student/verify` | bearer + navigateur | body `{ code }` → `MeResponse` ; 400 `student_code_invalid`, 409 `student_email_taken` |
| `POST /api/stripe/webhook` | signature Stripe | `{ received: true }` |
| `/api/auth/*` | — | Better Auth (sauf `/api/auth/one-time-token/*`, bloqué) |

Erreurs : `ApiError` JSON (`{ error, message? }`). 401 `unauthorized` sans session valide, 409 `browser_replaced` si un autre navigateur s'est connecté depuis, 400 `invalid_request` si `x-super-x-browser` manque.

Le texte des commentaires envoyé à `/api/classify` n'est jamais stocké ni journalisé : il est transmis à OpenRouter dans `state` (données), jamais concaténé aux instructions.
