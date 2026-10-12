# Mise en service de Cash Boost

Il n'y a ni backend ni compte à créer : seule l'extension se publie (ADR 0010). Chaque utilisateur
apporte sa propre clé OpenRouter pour la classification Jev.

## 0. Avant tout : valider l'envoi par XChat

L'extension envoie le lead magnet par l'interface XChat, dans un onglet x.com épinglé qu'elle ouvre
elle-même, après avoir lu les 10 derniers messages (ADR 0009). Validé à la main le 12/10/2026, sauf
le clic simulé sur Envoyer.

1. `pnpm dev`, puis charger `apps/extension/build/chrome-mv3-dev` dans `chrome://extensions`
   (mode développeur → *Load unpacked*), sur ton compte X.
2. Au premier envoi, l'onglet épinglé peut demander ton code XChat : le side panel affiche
   « Déverrouille XChat ». Tape le code dans l'onglet, puis « Relancer les campagnes ».
3. Lancer une campagne sur un tweet de test, faire commenter le mot-clé par 3–4 comptes (DMs ouverts
   ou fermés, dont un qui a déjà reçu le lien).
4. Vérifier : DM reçu une seule fois, like, réponse publique ; rien de renvoyé à celui qui avait déjà le lien.

Si l'envoi par XChat échoue : passer `x.dmMode` à `api` (ancien endpoint, sans lecture des DMs) ou
`public_reply` (lien dans la réponse publique) dans `DEFAULT_CONFIG`
(`packages/application/src/config.ts`), puis publier une nouvelle version.

## 1. Clé OpenRouter (chaque utilisateur)

Créer une clé sur openrouter.ai et créditer quelques dollars. Coût de Jev : ~0,04 $ par million de
tokens en entrée. La coller dans le side panel (onglet Options, champ « Clé OpenRouter ») : elle reste
dans `chrome.storage.local` et n'est envoyée qu'à openrouter.ai. Sans clé, seuls les commentaires qui
contiennent le mot-clé sont traités.

## 2. Chrome Web Store

```bash
cd apps/extension
pnpm package    # build de production + zip
```

Sur le tableau de bord développeur du Chrome Web Store : nouvel élément, téléverser le zip, visibilité
**non répertoriée**, fiche (description, captures, politique de confidentialité). Pour chaque nouvelle
version (un changement côté X, par exemple) : augmenter `version` dans `apps/extension/package.json`,
`pnpm package`, téléverser.

## 3. Parcours d'un utilisateur

1. Installation depuis le lien du Web Store, clic sur l'icône → side panel.
2. L'extension détecte le compte X connecté sur x.com (ouvre un onglet épinglé si besoin).
3. Avertissement CGU X à accepter, clé OpenRouter collée dans l'onglet Options, puis première campagne.
