# Cash Boost — Spécification produit (MVP)

Extension Chrome qui automatise la livraison de lead magnets sur X : à partir d'un de ses propres tweets, l'utilisateur récupère automatiquement chaque personne qui commente le mot-clé, lui envoie le lead magnet en DM (sauf s'il y est déjà), like son commentaire et lui répond publiquement.

> ⚠️ L'automatisation via la session X viole les CGU de X. Risque de restriction ou suspension du compte. Un avertissement avec case à cocher est obligatoire au premier lancement.

## Utilisateurs et accès

| Public | Accès |
|---|---|
| Élèves de la formation **Growth Boost** (LearnHouse self-hosted, `learn.example.com`) | Gratuit |
| Tout le monde | Essai 3 jours sans CB, puis **99 $ / 99 € TTC** one-time (accès à vie + mises à jour) |

- **Connexion** : Google uniquement (Better Auth). Pas de connexion X, pas de magic link.
- **Vérification élève** : le backend appelle l'Admin API LearnHouse (token `lh_` côté serveur uniquement) et vérifie l'appartenance au **groupe d'utilisateurs** lié au cours Growth Boost (cours privé).
  - Correspondance automatique par email Google.
  - Sinon : l'élève saisit son **email d'achat Growth Boost** (menu compte, ou « Je suis élève » sur le paywall) ; le backend le cherche dans le groupe via l'Admin API, puis envoie un **code à 6 chiffres** à cet email (Resend, `contact@mail.example.com`, valable 15 min). Le code saisi prouve que l'email lui appartient (ADR 0008).
  - **Un achat = un compte** : l'email lié est verrouillé sur l'Account (unique en base), refusé pour tout autre compte (`student_email_taken`) ; un Account ne peut pas changer d'email lié. Seul l'admin peut délier.
  - 5 tentatives par heure et par compte (`student_link_limit`).
- **Revérification de l'accès** : toutes les 24 h, tolérance de 72 h si le backend est indisponible.
- **Essai** : démarre au lancement de la première campagne ; un seul essai par compte Google **et** par compte X. À la fin : campagnes en pause, données conservées, CTA paiement.
- **Paiement** : Stripe Checkout (utilisateur déjà connecté → `client_reference_id`), Stripe Tax activé, devise selon le pays. Webhook → licence activée ; remboursement → licence révoquée. Rétractation 14 jours.
- **Licence** : 1 compte, 1 navigateur actif. Connexion sur un nouveau navigateur → l'ancien est déconnecté et ses campagnes s'arrêtent (last-login-wins), max 3 changements / semaine.

## Campagne

### Création (side panel)
- URL du tweet — **doit appartenir au compte X connecté**
- Mot-clé (saisi par l'utilisateur)
- URL du lead magnet, et ses éventuels anciens liens (comptent comme déjà envoyés)
- 3–5 variantes de DM, 3–5 variantes de réponse « envoyé », 3–5 variantes de réponse « DM fermé » — variables `{prénom}`, `{@handle}`
- Option « doit me suivre » (désactivée par défaut)
- Durée de surveillance (48 h par défaut)

Max **3 campagnes actives**, quota de compte commun, file servie en round-robin.

### Commentaires éligibles
- **Réponses directes au tweet uniquement** (premier niveau, pas les réponses imbriquées).
- Une personne n'est traitée qu'une fois par campagne, sur le commentaire qui demande le lead magnet ; elle peut l'être de nouveau dans une autre campagne.
- Les réponses du compte lui-même sont ignorées.

### Détection du mot-clé
1. Filtre local : texte normalisé (casse, accents, emojis, ponctuation) contient le mot-clé → match immédiat.
2. Sinon → **Jev** (`typesafe/jev-1.13`, OpenRouter Decisions API) via le proxy backend : « Ce commentaire demande-t-il à recevoir le lead magnet "<mot-clé>" ? »
   - p ≥ 0,8 → traité automatiquement
   - 0,4 ≤ p < 0,8 → file **« à valider »** dans le side panel (validation en un clic)
   - p < 0,4 → ignoré
   - Seuils pilotés par la config distante. Plafond : 2 000 classifications / utilisateur / jour.

### Traitement d'un lead (ADR 0009)
**Seule la présence du lien dans les DMs dit que le lead magnet a été envoyé** ; le like et la réponse ne comptent pas.
1. Vérification : historique de l'extension (même personne, même lien, toutes campagnes), sinon les 10 derniers messages de la conversation XChat.
2. Lien absent (et condition « doit me suivre » remplie) → DM avec le lead magnet → like → réponse publique « envoyé en DM ».
3. Lien déjà présent → like → réponse publique « envoyé en DM », sans renvoyer le lien.
4. DMs fermés → like → réponse publique « ouvre tes DMs / suis-moi » → nouvel essai du DM à chaque cycle jusqu'à la fin de la campagne.
5. XChat illisible (code demandé, page changée) → rien n'est envoyé, toutes les campagnes en pause, message dans le side panel (« Déverrouille XChat »).

### Surveillance
- Poll toutes les 5–15 min (aléatoire) via `chrome.alarms`, tant que Chrome est ouvert, pendant la durée choisie.
- Chaque tick est idempotent ; état (curseurs, leads vus, file) persisté dans `chrome.storage.local`.

## Garde-fous anti-ban (non contournables)

| | Compte gratuit | Compte Premium |
|---|---|---|
| Nouveaux DMs / jour | 20 | 60 |
| Likes / heure | 30 | 30 |
| Réponses / jour | 100 | 100 |

- Délai aléatoire 30–120 s entre deux actions ; type de compte détecté automatiquement.
- Au-delà du plafond : les leads attendent dans la file (visible dans le side panel).
- Arrêt immédiat de toutes les campagnes sur 429 / code 88, 226, 326, 344/185, session expirée, XChat verrouillé ou méconnaissable ; kill switch manuel.

## Exécution côté X
- Pas d'API officielle. Appels aux endpoints internes de x.com (`TweetDetail`, `FavoriteTweet`, `CreateTweet`, DM) **exécutés dans un onglet x.com** (content script MAIN world) pour réutiliser cookies, Origin et `x-client-transaction-id` de la page.
- Le service worker orchestre (planification, état, quotas) ; si aucun onglet x.com n'est ouvert, il en ouvre un épinglé en arrière-plan.
- **queryIds, features, seuils et plafonds** servis par la config distante du backend (correctifs sans republier).
- **DMs par l'interface XChat** (ADR 0009) : X Chat (chiffré E2E) a remplacé les DMs. L'extension ouvre `x.com/i/chat/<conversation>` dans un onglet épinglé dédié, lit les derniers messages, puis tape et envoie. Repères de l'interface servis par la config distante. Replis : ancien endpoint DM (`api`) ; en dernier recours, lien envoyé en réponse publique.

## Données et confidentialité
- Le texte des commentaires transite par le backend et OpenRouter pour classification, **n'est jamais stocké côté serveur**.
- Historique des leads stocké **uniquement en local**, rangé par handle X. Export CSV par campagne (handle, nom, date, statut DM, campagne).
- Politique de confidentialité RGPD requise.
- Pas de Sentry au MVP ; l'extension remonte les codes d'erreur X (sans contenu) → compteur par version de config distante.

## Interface
- **Side panel** Chrome : création de campagne, suivi en direct, file, « à valider », quotas, export CSV.
- Langues : **anglais et français** (fichiers de traduction).
- V2 : bouton « Lancer une campagne » injecté sous les tweets.

## Admin (page servie par Hono, rôle admin via Google)
- Édition de la config distante (queryIds, features, seuils Jev, plafonds).
- Liste des utilisateurs : statut (élève / essai / payé), navigateur actif ; octroi/retrait manuel d'accès.
- Email d'achat Growth Boost lié à chaque compte, avec un bouton « Délier » pour le libérer.

## Distribution
Chrome Web Store en **non répertorié** ; plan B : zip à charger en mode développeur.

## Ordre de livraison
1. **Spike DM** (jetable) : depuis un onglet x.com sur un compte de test, envoyer un DM et un like. Mesurer la part de commentateurs joignables sans chiffrement. Go / no-go avant toute architecture.
2. **Moteur local** : domaine + cas d'usage en TDD, adaptateur X, side panel, campagne de bout en bout — sans backend ni auth.
3. **Backend** : Better Auth Google, vérification LearnHouse, essai, Stripe, config distante, proxy Jev.
4. **Finitions** : admin, i18n EN/FR, publication Web Store.
