# 0006 — Détection du mot-clé : filtre local + Jev

**Statut** : accepté — 2026-10-11

## Décision
1. Filtre local sur texte normalisé : contient le mot-clé → match.
2. Sinon, Jev (`typesafe/jev-1.13`, version épinglée) via l'OpenRouter Decisions API, appelé par le backend.
3. Seuils (RemoteConfig) : ≥ 0,75 auto ; 0,4–0,75 PendingReview ; < 0,4 rejeté. Plafond 2 000 classifications / utilisateur / jour.

Le texte des commentaires n'est jamais stocké côté serveur.
