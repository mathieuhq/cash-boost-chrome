# 0002 — Injection de dépendances manuelle

**Statut** : accepté — 2026-10-11

## Décision
Injection par constructeur, câblée à la main dans une **composition root** par exécutable (background de l'extension, side panel, backend). Pas de conteneur IoC (InversifyJS, tsyringe), pas de décorateurs ni de reflect-metadata.

## Raisons
Zéro magie, compatible service worker MV3, tests triviaux (on passe des fakes au constructeur).
