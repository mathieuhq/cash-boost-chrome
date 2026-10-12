# 0003 — Stratégie TDD

**Statut** : accepté — 2026-10-11

## Décision
- Vitest.
- Domaine et cas d'usage écrits en TDD avec des fakes en mémoire des ports (FakeXGateway, FakeClock, InMemoryCampaignRepository, FakeClassifier…).
- Adaptateur X : tests de contrat contre des réponses x.com réelles enregistrées et anonymisées (fixtures) — détectent les changements de format.
- Backend : cas d'usage en TDD avec fakes ; adaptateurs Drizzle testés contre un Postgres de test.
- Aucun test ne touche le vrai X en CI ; un script de smoke test manuel sur compte de test.
