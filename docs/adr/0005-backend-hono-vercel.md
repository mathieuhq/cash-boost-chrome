# 0005 — Backend Hono + Better Auth + Postgres sur Vercel

**Statut** : remplacé par l'ADR 0010 — 2026-10-12 (accepté le 2026-10-11 ; Firebase envisagé puis écarté)

## Décision
- Hono sur Vercel Functions (région `cdg1`).
- Postgres Neon (marketplace Vercel), driver serverless, Drizzle ORM.
- Better Auth, provider Google uniquement ; l'origine de l'extension ajoutée aux `trustedOrigins`.
- Stripe Checkout + Stripe Tax, webhooks pour activer / révoquer la licence.
- LearnHouse self-hosted : Admin API avec token `lh_` côté serveur, vérification par groupe d'utilisateurs.
- Proxy OpenRouter pour Jev (clé jamais dans l'extension).
- Page admin minimale servie par Hono.

## Écarté
- Connexion X : l'app développeur X pourrait être suspendue et casser la connexion de tous.
- Magic link : non souhaité.
- Firebase : remplacé par Better Auth + Postgres.
