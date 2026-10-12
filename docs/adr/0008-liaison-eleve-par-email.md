# 0008 — Liaison élève par email d'achat vérifié, verrouillée sur un compte

**Statut** : remplacé par l'ADR 0010 — 2026-10-12 (accepté le 2026-10-12 ; remplaçait la lecture du cookie `LH_access` prévue par la SPEC)

## Décision
1. L'élève saisit l'email avec lequel il a acheté Growth Boost (`POST /api/student/link { email }`).
2. Le backend normalise l'email (trim + minuscules) et vérifie, dans l'ordre :
   - l'Account n'a pas déjà un email lié (`409 student_already_linked`) ;
   - 5 demandes par heure et par Account au plus (`429 student_link_limit`), comptées avant tout appel ;
   - l'email est membre des groupes Growth Boost (Admin API LearnHouse, jeton `lh_` en lecture seule) ;
   - aucun autre Account ne détient cet email (`409 student_email_taken`).
3. Il envoie un code à 6 chiffres à cet email via Resend, depuis `contact@mail.example.com`.
   Le code est valable 15 minutes ; seul son hash SHA-256 (lié à l'Account et à l'email) est stocké
   (`student_link_codes`, un code en attente par Account). Une nouvelle demande remplace l'ancien code.
4. `POST /api/student/verify { code }` : 5 codes faux et le code est supprimé (`400 student_code_invalid`).
   Le bon code verrouille l'email sur l'Account : index unique `access_student_email_unique`.
5. La correspondance automatique par email Google ne demande pas de code (Google a déjà vérifié
   l'email) mais respecte le même verrou.
6. L'admin peut délier (`/admin`, bouton « Délier »), ce qui libère l'email.

## Raisons
- Le code prouve que l'élève possède l'email d'achat : connaître l'email d'un élève ne suffit plus
  pour prendre son accès.
- Le verrou empêche de partager un achat entre plusieurs comptes.
- Aucun email n'est envoyé à une adresse qui n'a pas acheté, ni à une adresse déjà liée : le
  formulaire ne peut pas servir à spammer.
- La limite protège le quota de l'Admin API (60 recherches par email / min et par jeton) et le volume
  d'envoi Resend.
- Plus de session LearnHouse à ouvrir dans Chrome, ni de permission `cookies` ou d'hôte LearnHouse
  dans le manifest.

## Conséquences
Le domaine `mail.example.com` doit être vérifié dans Resend (SPF/DKIM). En dev, sans
`RESEND_API_KEY`, le code s'affiche dans la console du backend.
