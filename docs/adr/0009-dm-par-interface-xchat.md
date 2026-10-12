# 0009 — DMs par l'interface XChat, les DMs comme seule vérité

**Statut** : accepté — 2026-10-12

## Contexte
X a remplacé les DMs par XChat (chiffré de bout en bout). Lire une conversation par l'API demande les clés de l'utilisateur (API officielle payante ou rétro-ingénierie du protocole). La page `x.com/i/chat/<conversation>`, elle, affiche les messages déchiffrés.

L'utilisateur gère aussi des commentaires à la main : like, réponse « dans tes DMs », DM. Sur un vrai post (2026-10-12), ~45 commentaires étaient likés sans réponse, 26 sans like ni réponse : le like et la réponse ne disent pas si le lead magnet est parti.

## Décision
- **Seule la présence du lien dans les DMs dit que le lead magnet a été envoyé.** Le like et la réponse publique ne comptent pas.
- Avant chaque envoi : historique local d'abord (même personne, même lien, n'importe quelle Campaign : pas besoin d'ouvrir XChat), sinon lecture des **10 derniers messages** de la conversation, quel que soit l'expéditeur.
- Lien comparé sans schéma, sans `www.`, sans paramètres de suivi ni `/` final ; les « anciens liens » de la Campaign comptent aussi. Un autre lead magnet est toujours envoyé.
- Ordre : DMs (lecture puis envoi) → like → réponse « dans tes DMs ». Lien déjà présent : like + réponse, sans renvoi.
- Envoi par l'interface XChat (`dmMode: "xchat_ui"`) dans un **onglet épinglé dédié** : ouverture directe de `/i/chat/<id bas>-<id haut>`, saisie par le setter natif du textarea + événement `input`, clic sur Envoyer, attente de `data-send-status="sent"`. Non confirmé → erreur transitoire ; la tentative suivante relit les DMs, donc pas de doublon.
- Repères `data-testid` de XChat (shadow root ouvert) dans la RemoteConfig (`x.xchat`).
- Pas de lecture possible = pas d'envoi : XChat verrouillé par le code → CircuitBreaker `xchat_locked` (« Déverrouille XChat ») ; repère introuvable → `xchat_unavailable`. Les deux mettent toutes les Campaigns en pause, relance manuelle.
- Pas de Jev pour trouver les boutons : un mauvais clic coûte plus cher qu'une pause.

## Conséquences
- Le chemin `api` (ancien endpoint) reste, sans vérification des DMs ; `public_reply` aussi.
- Validé à la main le 2026-10-12 : ouverture directe, saisie simulée acceptée, bouton Envoyer, lien affiché en clair. **Reste à valider avec l'extension** : le clic simulé sur Envoyer, l'attribut `sent`, l'écran affiché quand les DMs sont fermés.
- Sur un nouveau navigateur, l'utilisateur tape son code XChat une fois dans l'onglet dédié.
- 2026-10-12, premier test réel : lien renvoyé alors qu'il était déjà dans les DMs. L'onglet dédié est en arrière-plan, Chrome y espace les minuteurs d'environ 1 s, et la lecture a conclu « conversation vide » avant le déchiffrement. Une conversation vide doit maintenant rester vide 6 s avant l'envoi.
