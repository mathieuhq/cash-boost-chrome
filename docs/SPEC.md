# Cash Boost — Spécification produit (MVP)

Extension Chrome qui automatise la livraison de lead magnets sur X : à partir d'un de ses propres tweets, l'utilisateur récupère automatiquement chaque personne qui commente le mot-clé, lui envoie le lead magnet en DM (sauf s'il y est déjà), like son commentaire et lui répond publiquement.

> ⚠️ L'automatisation via la session X viole les CGU de X. Risque de restriction ou suspension du compte. Un avertissement avec case à cocher est obligatoire au premier lancement.

## Utilisateurs et accès

- Extension **gratuite pour tout le monde**, sans compte ni connexion (ADR 0010).
- La classification Jev utilise la **clé OpenRouter de l'utilisateur**, collée dans le side panel (onglet Options, champ « Clé OpenRouter »). L'utilisateur paie son propre usage.

## Campagne

### Création (side panel)
- Titre (facultatif ; sinon la première ligne du tweet)
- URL du tweet — **doit appartenir au compte X connecté**
- Mot-clé (saisi par l'utilisateur)
- URL du lead magnet, et ses éventuels anciens liens (comptent comme déjà envoyés)

Valeurs par défaut, réglées une fois dans l'onglet **Options** et appliquées à chaque nouvelle campagne (les campagnes en cours ne changent pas) :
- 3–5 variantes de DM, 3–5 variantes de réponse « envoyé », 3–5 variantes de réponse « DM fermé » — variables `{prénom}`, `{@handle}`
- Option « doit me suivre » (désactivée par défaut)
- Durée de surveillance (48h par défaut)

Max **3 campagnes actives**, quota de compte commun, file servie en round-robin.

### Commentaires éligibles
- **Réponses directes au tweet uniquement** (premier niveau, pas les réponses imbriquées).
- Une personne n'est traitée qu'une fois par campagne, sur le commentaire qui demande le lead magnet ; elle peut l'être de nouveau dans une autre campagne.
- Les réponses du compte lui-même sont ignorées.

### Détection du mot-clé
1. Filtre local : texte normalisé (casse, accents, emojis, ponctuation) contient le mot-clé → match immédiat.
2. Sinon → **Jev** (`typesafe/jev-1.13`, OpenRouter Decisions API), appelé directement par l'extension avec la clé de l'utilisateur : « Ce commentaire demande-t-il à recevoir le lead magnet "<mot-clé>" ? » Le texte du commentaire est passé dans `state`, comme une donnée.
   - p ≥ 0,8 → traité automatiquement
   - 0,4 ≤ p < 0,8 → file **« à valider »** dans le side panel (validation en un clic)
   - p < 0,4 → ignoré
   - Seuils dans la config livrée avec l'extension. Pas de plafond de classifications.
   - Sans clé : le commentaire n'est pas classé et attend ; il est repris à chaque cycle une fois la clé saisie.

### Traitement d'un lead (ADR 0009)
**Seule la présence du lien dans les DMs dit que le lead magnet a été envoyé** ; le like et la réponse ne comptent pas.
1. Vérification : historique de l'extension (même personne, même lien, toutes campagnes), sinon les 10 derniers messages de la conversation XChat.
2. Lien absent (et condition « doit me suivre » remplie) → DM avec le lead magnet → like → réponse publique « envoyé en DM » (sautée pour 30 % des leads, tirés au sort).
3. Lien déjà présent → like → réponse publique « envoyé en DM » (même règle), sans renvoyer le lien.
4. DMs fermés → like → réponse publique « ouvre tes DMs / suis-moi » → nouvel essai du DM à chaque cycle jusqu'à la fin de la campagne.
5. XChat illisible (code demandé, page changée) → rien n'est envoyé, toutes les campagnes en pause, message dans le side panel (« Déverrouille XChat »).

### Surveillance
- Poll toutes les 5–15 min (aléatoire) via `chrome.alarms`, tant que Chrome est ouvert, pendant la durée choisie ; toutes les 20–45 min après trois polls sans nouveau commentaire ; jamais la nuit (heures actives, ci-dessous).
- Un nouveau commentaire n'est traité qu'après un délai de « remarque » (20 s à 2 min 30).
- Chaque tick est idempotent ; état (curseurs, leads vus, file) persisté dans `chrome.storage.local`.

## Garde-fous anti-ban (non contournables)

| | Compte gratuit | Compte Premium |
|---|---|---|
| Nouveaux DMs / jour | 20 | 60 |
| Likes / heure | 30 | 30 |
| Réponses / jour | 100 | 100 |

- Cadence humaine (ADR 0011) : un lead traité d'une traite (DM, like, réponse à 5–25 s d'écart), 25 s à 4 min entre deux leads (délais tirés vers le court), pause de 8–35 min après 5–12 actions, rien entre 21h et 8h (heure locale du navigateur, réveil décalé de 0–45 min chaque jour). Type de compte détecté automatiquement.
- Dans XChat, le DM est tapé mot à mot après un temps de lecture, puis relu avant l'envoi ; le scan des commentaires marque une pause entre deux pages.
- Montée en charge : les plafonds valent 40 % le premier jour d'activité et atteignent 100 % au septième. Chaque jour, les plafonds de DMs et de réponses sont ramenés à 70–100 % de leur valeur (tirage quotidien). Les quotas affichés dans Options sont ceux appliqués.
- Variété : jamais deux fois la même variante de message à la suite ; 30 % des leads livrés ne reçoivent pas de réponse publique « envoyé en DM » (la réponse « ouvre tes DMs » est toujours envoyée).
- Au-delà du plafond : les leads attendent dans la file (visible dans le side panel).
- Arrêt immédiat de toutes les campagnes sur 429 / code 88, 226, 326, 344/185, session expirée, XChat verrouillé ou méconnaissable ; arrêt d'urgence manuel.

## Exécution côté X
- Pas d'API officielle. Appels aux endpoints internes de x.com (`TweetDetail`, `FavoriteTweet`, `CreateTweet`, DM) **exécutés dans un onglet x.com** (content script MAIN world) pour réutiliser cookies, Origin et `x-client-transaction-id` de la page.
- Le service worker orchestre (planification, état, quotas) ; si aucun onglet x.com n'est ouvert, il en ouvre un épinglé en arrière-plan.
- **queryIds, features, seuils et plafonds** dans la config livrée avec l'extension (`DEFAULT_CONFIG`) : un changement côté X demande une nouvelle version.
- **DMs par l'interface XChat** (ADR 0009) : X Chat (chiffré E2E) a remplacé les DMs. L'extension ouvre `x.com/i/chat/<conversation>` dans un onglet épinglé dédié, lit les derniers messages, puis tape et envoie. Repères de l'interface dans la config livrée avec l'extension. Replis : ancien endpoint DM (`api`) ; en dernier recours, lien envoyé en réponse publique.

## Données et confidentialité
- Aucun serveur Cash Boost. Le texte d'un commentaire sans mot-clé part du navigateur directement vers OpenRouter, avec la clé de l'utilisateur, pour classification.
- Clé OpenRouter stockée **uniquement en local** (`chrome.storage.local`), envoyée seulement à openrouter.ai.
- Historique des leads stocké **uniquement en local**, rangé par handle X. Export CSV par campagne (handle, nom, date, statut DM, campagne).
- Politique de confidentialité RGPD requise.
- Pas de télémétrie : aucun code d'erreur ni contenu n'est remonté.

## Interface
- **Side panel** Chrome : création de campagne, suivi en direct, file, « à valider », options (messages et durée par défaut, quotas, arrêt d'urgence), export CSV.
- Langues : **anglais et français** (fichiers de traduction).
- V2 : bouton « Lancer une campagne » injecté sous les tweets.

## Distribution
Chrome Web Store en **non répertorié** ; plan B : zip à charger en mode développeur.

## Ordre de livraison
1. **Spike DM** (jetable) : depuis un onglet x.com sur un compte de test, envoyer un DM et un like. Mesurer la part de commentateurs joignables sans chiffrement. Go / no-go avant toute architecture.
2. **Moteur local** : domaine + cas d'usage en TDD, adaptateur X, side panel, campagne de bout en bout.
3. **Classification** : Jev appelé depuis l'extension avec la clé OpenRouter de l'utilisateur.
4. **Finitions** : i18n EN/FR, publication Web Store.
