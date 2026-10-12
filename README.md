<p align="center">
  <img src="docs/brand/cash-boost-logo.svg" alt="Cash Boost" height="56">
</p>

<p align="center">
  Extension Chrome qui livre automatiquement vos lead magnets sur X.<br>
  Les gens commentent le mot-clé sous votre tweet. Cash Boost leur envoie le lien en DM, like leur commentaire et leur répond.
</p>

---

> [!WARNING]
> Cash Boost automatise des actions avec votre session X, ce que les conditions d'utilisation de X interdisent. Votre compte risque d'être restreint ou suspendu. L'extension affiche un avertissement à accepter au premier lancement. Vous l'utilisez à vos risques.

## Fonctionnement

1. Dans le side panel, vous créez une **campagne** : l'URL d'un de vos tweets, le mot-clé (« GUIDE ») et le lien du lead magnet. Les variantes de messages et la durée de surveillance se règlent une fois pour toutes dans l'onglet Options.
2. Toutes les 5 à 15 minutes (moins souvent quand le post se calme, jamais la nuit), l'extension lit les réponses directes au tweet.
3. Chaque commentaire est classé :
   - le mot-clé est présent (après normalisation de la casse, des accents et des emojis) : le commentaire est retenu ;
   - sinon, le modèle [Jev](docs/adr/0006-classification-jev.md) estime si la personne demande le lead magnet. Au-dessus de 0,8 le commentaire est traité, entre 0,4 et 0,8 il attend votre validation en un clic, en dessous il est ignoré. Jev demande votre propre clé OpenRouter ; sans clé, seuls les commentaires qui contiennent le mot-clé sont traités, les autres attendent.
4. Pour chaque lead, l'extension regarde d'abord dans les DMs si le lien a déjà été envoyé. S'il ne l'a pas été, elle envoie le DM, puis like le commentaire et répond publiquement. Si les DMs sont fermés, elle répond « ouvre tes DMs » et retente à chaque cycle.

Les actions suivent le rythme d'une personne : un lead traité d'une traite, des délais courts le plus souvent et longs parfois, une pause après quelques actions, rien entre 21h et 8h, le DM tapé mot à mot, jamais deux fois le même message à la suite, et pas de réponse publique à tout le monde. Des quotas par compte (DMs par jour, likes par heure, réponses par jour) plafonnent le tout, réduits la première semaine et un peu différents chaque jour. Toutes les campagnes s'arrêtent si X renvoie un signal de restriction.

L'extension est gratuite et ne demande aucun compte. Tout reste dans le navigateur (`chrome.storage.local`) : campagnes, leads, files et votre clé OpenRouter. Le texte d'un commentaire ne sort du navigateur que pour être classé par Jev, envoyé directement à OpenRouter avec votre clé.

<p align="center">
  <img src="docs/sidepanel.png" alt="Side panel de Cash Boost : campagnes, leads à valider et quotas du jour" width="360">
</p>

La spécification complète est dans [docs/SPEC.md](docs/SPEC.md), le vocabulaire du domaine dans [CONTEXT.md](CONTEXT.md).

## Architecture

Monorepo TypeScript (pnpm + Turborepo), organisé en Clean Architecture ([ADR 0001](docs/adr/0001-clean-architecture-monorepo.md)) avec injection de dépendances manuelle ([ADR 0002](docs/adr/0002-injection-manuelle.md)).

```
apps/
  extension/          extension Chrome MV3 (Plasmo, React, Tailwind v4, shadcn/ui)
packages/
  domain/             règles pures : campagne, mot-clé, lead, classification, file d'actions
  application/        moteur de campagne (Tick idempotent), ports et config (DEFAULT_CONFIG)
  adapters-x/         appels à l'API interne de X et parsing des réponses
  adapters-chrome/    stockage, alarmes, onglets x.com et XChat
  adapters-openrouter/ classification Jev par l'OpenRouter Decisions API
docs/
  SPEC.md             spécification produit
  adr/                décisions d'architecture
  research/           faits vérifiés sur l'API X et Jev
  MISE-EN-SERVICE.md  publication sur le Chrome Web Store
```

Points clés :

- Les appels X partent d'un onglet x.com ouvert, avec la session de l'utilisateur ([ADR 0004](docs/adr/0004-execution-x-dans-onglet.md)).
- Les DMs passent par l'interface web de XChat, dans un onglet épinglé dédié. Seule la présence du lien dans la conversation prouve qu'il a été envoyé ([ADR 0009](docs/adr/0009-dm-par-interface-xchat.md)).
- Pas de backend : Jev est appelé depuis l'extension avec la clé OpenRouter de l'utilisateur, et la config (seuils, quotas, queryIds X, repères XChat) est livrée avec l'extension ([ADR 0010](docs/adr/0010-extension-sans-backend.md)).

## Démarrage

Prérequis : Node.js 24 et pnpm 11.

```bash
pnpm install
pnpm dev
```

Chargez ensuite `apps/extension/build/chrome-mv3-dev` dans `chrome://extensions` (mode développeur, « Charger l'extension non empaquetée »). Pour que Jev classe les commentaires, collez votre clé OpenRouter dans le side panel (onglet Options, champ « Clé OpenRouter »).

## Commandes

| Commande | Effet |
|---|---|
| `pnpm dev` | extension en watch |
| `pnpm test` | tests Vitest de tous les paquets, sans appel à un service externe |
| `pnpm typecheck` | vérification TypeScript |
| `pnpm build` | build de production de l'extension |

Le code est écrit en TDD ([ADR 0003](docs/adr/0003-tdd-strategie-de-test.md)) : le domaine et le moteur sont testés avec des fakes.

## Déploiement

Seule l'extension se déploie, sur le Chrome Web Store. Le build est décrit dans [apps/extension/README.md](apps/extension/README.md), la publication dans [docs/MISE-EN-SERVICE.md](docs/MISE-EN-SERVICE.md). Corriger un changement côté X demande de publier une nouvelle version.

## Contribuer

Les issues et pull requests sont bienvenues. Avant d'ouvrir une PR :

- utilisez les termes de [CONTEXT.md](CONTEXT.md) dans le code ;
- ajoutez des tests pour tout changement de comportement ;
- vérifiez que `pnpm test` et `pnpm typecheck` passent ;
- consignez toute décision d'architecture dans un nouvel ADR sous `docs/adr/`.

## Licence

[MIT](LICENSE)
