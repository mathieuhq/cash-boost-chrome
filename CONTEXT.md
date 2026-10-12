# Cash Boost — Langage du domaine

Termes à utiliser tels quels dans le code (anglais) et la conversation.

| Terme | Définition |
|---|---|
| **Campaign** | Une surveillance d'un tweet lead magnet de l'utilisateur, avec son mot-clé, son lead magnet, ses templates et sa durée. Statuts : `active`, `paused`, `finished`. |
| **SourceTweet** | Le tweet de l'utilisateur ciblé par une Campaign. Doit appartenir au compte X connecté. |
| **Keyword** | Le mot que les gens commentent pour recevoir le lead magnet. Saisi par l'utilisateur. |
| **LeadMagnet** | La ressource promise (une URL au MVP). |
| **Comment** | Une réponse **directe** (premier niveau) au SourceTweet. Les réponses imbriquées ne sont pas des Comments. |
| **Match** | Résultat de la détection du Keyword dans un Comment : `exact` (filtre local), `classified` (Jev, avec probabilité), `rejected`. |
| **PendingReview** | Comment dont la probabilité Jev est dans la zone grise ; attend une validation manuelle. |
| **Lead** | Auteur d'un Comment matché. Unique par (Campaign, auteur). Survit à la suppression de sa Campaign : il passe dans l'archive, reste visible et exportable, et le moteur n'agit plus dessus. |
| **Delivery** | Tentative d'envoi du LeadMagnet en DM à un Lead, précédée d'une lecture des DMs : seule la présence du lien dans les DMs fait foi. Statuts : `queued`, `sent` (envoyé, ou `alreadySent` si le lien y était déjà), `dm_closed` (réessayée à chaque Tick), `failed`. |
| **Acknowledgement** | Réponse publique au Comment : `sent` (« envoyé en DM ») ou `dm_closed` (« ouvre tes DMs / suis-moi »). |
| **MessageTemplate** | Variante de texte avec variables `{prénom}`, `{@handle}`. Trois familles : DM, ack sent, ack dm_closed. |
| **Action** | Opération unitaire sur X : `like`, `dm`, `reply`. Toute Action consomme du Quota. |
| **Quota** | Plafonds par compte X (DMs/jour, likes/heure, réponses/jour), dépendant de l'AccountTier, partagés entre Campaigns. |
| **AccountTier** | `free` ou `premium` (compte X). |
| **ActionQueue** | File des Actions en attente, servie en round-robin entre Campaigns, cadencée par délais aléatoires et Quota. |
| **Tick** | Un cycle idempotent déclenché par alarme : scanner les nouveaux Comments, classer, enfiler, exécuter les Actions permises. |
| **CircuitBreaker** | Arrêt de toutes les Campaigns sur signal de restriction X (429/88, 226, 326, 344/185, session expirée), XChat verrouillé (`xchat_locked`) ou méconnaissable (`xchat_unavailable`), ou kill switch. |
| **XChat** | La messagerie chiffrée de X. L'extension la pilote par sa page web, dans un onglet épinglé dédié (ADR 0009). |
| **RemoteConfig** | Config servie par le backend : queryIds, features X, mode d'envoi des DMs et repères XChat, seuils Jev, plafonds. Versionnée. |
| **Account** | Utilisateur Cash Boost (connexion Google). |
| **Entitlement** | Droit d'utiliser l'extension : `student`, `trial`, `paid`, `none`. |
| **Trial** | 3 jours, démarré à la première Campaign, unique par compte Google et par compte X. |
| **ActiveBrowser** | Le seul navigateur autorisé pour un Account ; le dernier connecté gagne. |
| **StudentLink** | Liaison définitive entre un Account et un email d'achat Growth Boost (membre du groupe LearnHouse), prouvée par un code envoyé à cet email ; un email ne peut être lié qu'à un seul Account. |
