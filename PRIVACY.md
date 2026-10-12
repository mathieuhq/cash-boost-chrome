# Politique de confidentialité de Cash Boost

Dernière mise à jour : 12 octobre 2026

Cash Boost est une extension Chrome sans serveur ni compte. Son éditeur ne collecte, ne reçoit et ne stocke aucune donnée.

## Données traitées

Pour faire fonctionner vos campagnes, l'extension traite dans votre navigateur :

- l'identifiant de votre compte X connecté ;
- les campagnes que vous créez : URL du tweet, mot-clé, lien envoyé, variantes de messages, réglages ;
- pour chaque commentaire lu sous votre tweet : le pseudo, le nom affiché et l'URL de la photo de profil de son auteur, le texte du commentaire et l'état de l'envoi (DM, like, réponse) ;
- votre clé OpenRouter, si vous en saisissez une.

## Où ces données sont stockées

Tout est stocké dans `chrome.storage.local`, sur votre ordinateur. Rien n'est envoyé à un serveur de l'éditeur : il n'en existe pas. Désinstaller l'extension supprime ces données.

## Avec qui elles sont partagées

- **X (x.com)** : l'extension lit les commentaires, envoie les DMs, les likes et les réponses depuis votre session X, comme si vous le faisiez vous-même. Ces actions sont soumises à la [politique de confidentialité de X](https://x.com/privacy).
- **OpenRouter (openrouter.ai)** : seulement si vous avez saisi une clé, le texte d'un commentaire et le mot-clé de la campagne sont envoyés à OpenRouter, avec votre clé, pour estimer si la personne demande le lien. Aucune autre donnée ne part. Voir la [politique de confidentialité d'OpenRouter](https://openrouter.ai/privacy).

Aucune donnée n'est vendue, utilisée pour de la publicité ou transmise à un autre tiers.

## Usage limité

L'utilisation des données respecte la [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq), y compris les exigences d'usage limité (Limited Use) : les données servent uniquement à la fonction de l'extension, l'envoi de votre lead magnet aux personnes qui le demandent.

## Contact

Pour toute question, ouvrez une issue sur [GitHub](https://github.com/mathieuhq/cash-boost-chrome/issues).
