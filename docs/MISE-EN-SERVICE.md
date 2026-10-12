# Mise en service de Cash Boost

Ce qu'il faut créer, dans l'ordre, pour qu'une vraie personne installe l'extension, se connecte avec
Google et lance une campagne. Compter environ une heure. Les variables d'environnement exactes sont dans
`apps/backend/.env.example` et `apps/extension/.env.example`.

## Tester en local sans aucun compte

```bash
pnpm dev --test
```

Lance le backend (PGlite, port 8787) et l'extension en watch. Avec `--test`, le bouton du panel devient
« Se connecter (compte de test) » : pas de Google, compte `test@superx.local` (admin, essai de 3 jours
disponible). Admin : http://localhost:8787/admin/test-login. Charger `apps/extension/build/chrome-mv3-dev`
dans `chrome://extensions`. Le flag est refusé par le backend en production.

## 0. Avant tout : valider l'envoi par XChat

L'extension envoie le lead magnet par l'interface XChat, dans un onglet x.com épinglé qu'elle ouvre
elle-même, après avoir lu les 10 derniers messages (ADR 0009). Validé à la main le 12/10/2026, sauf
le clic simulé sur Envoyer.

1. Charger l'extension en local (étape 5), sur ton compte X.
2. Au premier envoi, l'onglet épinglé peut demander ton code XChat : le side panel affiche
   « Déverrouille XChat ». Tape le code dans l'onglet, puis « Relancer les campagnes ».
3. Lancer une campagne sur un tweet de test, faire commenter le mot-clé par 3–4 comptes (DMs ouverts
   ou fermés, dont un qui a déjà reçu le lien).
4. Vérifier : DM reçu une seule fois, like, réponse publique ; rien de renvoyé à celui qui avait déjà le lien.

Si l'envoi par XChat échoue : dans l'admin (`/admin`), passer `x.dmMode` à `api` (ancien endpoint, sans
lecture des DMs) ou `public_reply` (lien dans la réponse publique), sans republier l'extension.
Une config déjà enregistrée en base garde son `dmMode` : le passer à `xchat_ui` dans l'admin.

## 1. Google Cloud (connexion Google)

1. console.cloud.google.com → nouveau projet « Cash Boost ».
2. *APIs & Services → OAuth consent screen* : type **External**, nom, logo, email de support,
   domaine du backend, liens CGU / confidentialité. Scopes : `openid`, `email`, `profile` (non sensibles :
   pas de vérification Google longue). **Publier l'application** (statut « In production ») : en
   « Testing », seuls les utilisateurs de test listés peuvent se connecter.
3. *Credentials → Create credentials → OAuth client ID* : type **Web application**.
   - Authorized redirect URI : `https://<backend>/api/auth/callback/google`
     (et `http://localhost:8787/api/auth/callback/google` pour le dev).
4. Copier le client ID et le secret → `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.

## 2. Base de données (Neon)

Depuis Vercel (*Storage → Neon*) ou neon.tech : région **Frankfurt** (`aws-eu-central-1`), la plus proche
de `cdg1`. Copier l'URL → `DATABASE_URL`, puis `pnpm --filter @super-x/backend db:migrate`.

## 3. Backend (Vercel)

1. Importer le dépôt dans Vercel : *Root Directory* `apps/backend`, *Framework* « Other », Node 24.
   `pnpm build` produit `.vercel/output` (bundle esbuild, contrats inclus) — détails dans `apps/backend/README.md`.
2. Variables : `BETTER_AUTH_SECRET` (`openssl rand -base64 32`), `BETTER_AUTH_URL` (URL publique),
   Google, `DATABASE_URL`, `EXTENSION_IDS`, `ADMIN_EMAILS`, OpenRouter, Stripe, LearnHouse, Resend.
3. `ADMIN_EMAILS` : les emails Google qui ont accès à `/admin` (config distante, utilisateurs, accès manuels).
4. `EXTENSION_IDS` : l'ID de dev (affiché par `pnpm key`) et, après publication, l'ID du
   Chrome Web Store, séparés par des virgules.

## 4. Services tiers

- **OpenRouter** (Jev) : créer une clé sur openrouter.ai, créditer quelques dollars →
  `OPENROUTER_API_KEY`. Coût : ~0,04 $ par million de tokens en entrée.
- **Stripe** : produit « Cash Boost — licence à vie », prix one-time 99 € (et 99 $ en `currency_options`),
  activer **Stripe Tax** ; webhook `https://<backend>/api/stripe/webhook` sur
  `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded` →
  `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`.
- **LearnHouse** : *Dashboard → Developers → API*, jeton en lecture seule avec les droits **Users (read)** et
  **User groups (read)** uniquement → `LEARNHOUSE_API_TOKEN` (côté backend seulement, jamais dans l'extension) ; l'UUID du groupe d'élèves Growth Boost →
  `LEARNHOUSE_GROUP_UUIDS`.
- **Resend** (code de liaison élève) : *Domains → Add domain* `mail.example.com`, ajouter chez le
  registrar les enregistrements DNS affichés (SPF, DKIM, MX de retour) et attendre « Verified » ;
  *API Keys → Create* avec la permission **Sending access** limitée à ce domaine → `RESEND_API_KEY`.
  L'expéditeur est `MAIL_FROM` (par défaut `Cash Boost <contact@mail.example.com>`).

## 5. Extension

```bash
cd apps/extension
cp .env.example .env.production   # PLASMO_PUBLIC_BACKEND_URL = URL Vercel
pnpm build                        # ou pnpm dev pour le dev local
```

Charger `build/chrome-mv3-prod` dans `chrome://extensions` (mode développeur → *Load unpacked*).
L'ID affiché doit être celui de `EXTENSION_IDS`.

Pour le Chrome Web Store (non répertorié) : `pnpm package`, téléverser le zip, puis copier la clé publique
du store dans `.env.production` (`CRX_PUBLIC_KEY`) et ajouter le nouvel ID à `EXTENSION_IDS`.

## 6. Parcours d'un utilisateur

1. Clic sur l'icône → side panel → **Se connecter avec Google** (fenêtre Google, retour automatique).
2. L'extension détecte le compte X connecté sur x.com (ouvre un onglet épinglé si besoin).
3. Avertissement CGU X à accepter, puis première campagne → l'essai de 3 jours démarre.
   Élève Growth Boost : accès reconnu par l'email Google, ou via *badge → Lier mon compte élève*.
4. Fin d'essai : campagnes en pause, bouton **Licence à vie · 99 €** (Stripe Checkout).
