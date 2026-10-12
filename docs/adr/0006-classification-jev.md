# 0006 — Détection du mot-clé : filtre local + Jev

**Statut** : accepté — 2026-10-11

## Décision
1. Filtre local sur texte normalisé : contient le mot-clé → match.
2. Sinon, Jev (`typesafe/jev-1.13`, version épinglée) via l'OpenRouter Decisions API, appelé par le backend.
3. Seuils (RemoteConfig) : ≥ 0,75 auto ; 0,4–0,75 PendingReview ; < 0,4 rejeté. Plafond 2 000 classifications / utilisateur / jour.

Le texte des commentaires n'est jamais stocké côté serveur.

Faits vérifiés : [docs/research/jev-openrouter.md](../research/jev-openrouter.md).

## Mise à jour (2026-10-12)
Sans backend (ADR 0010) : Jev est appelé directement par l'extension (`packages/adapters-openrouter`) avec la clé OpenRouter de l'utilisateur, le texte du commentaire passé dans `state` comme une donnée. Seuils dans la Config livrée avec l'extension : ≥ 0,8 auto ; 0,4–0,8 PendingReview ; < 0,4 rejeté. Plus de plafond journalier. Sans clé, seuls les matchs exacts sont traités ; les autres Comments attendent et sont repris à chaque Tick.
