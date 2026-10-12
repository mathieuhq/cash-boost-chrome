# 0003 — Stratégie TDD

**Statut** : accepté — 2026-10-11

## Décision
- Vitest.
- Domaine et cas d'usage écrits en TDD avec des fakes en mémoire des ports (FakeXGateway, FakeClock, InMemoryCampaignRepository, FakeClassifier…).
- Adaptateur X : tests de contrat contre des réponses x.com réelles enregistrées et anonymisées (fixtures) — détectent les changements de format.
- Adaptateur OpenRouter : testé avec un `fetch` simulé, sans appel réel (le backend, et ses tests sur Postgres, ont disparu avec l'ADR 0010).
- Aucun test ne touche le vrai X en CI ; un script de smoke test manuel sur compte de test.
