# @super-x/extension

Extension Chrome (Plasmo, MV3) : side panel React construit sur le design system **Cash Boost**
— shadcn/ui new-york, primary noir.

```bash
pnpm dev        # Tailwind en watch + plasmo dev → charger build/chrome-mv3-dev dans chrome://extensions
pnpm build      # build/chrome-mv3-prod
pnpm package    # zip prêt pour le Chrome Web Store
pnpm test       # vitest
pnpm typecheck
```

## Permissions

Aucune variable d'environnement. Hôtes : x.com (appels X et XChat) et `https://openrouter.ai/*`
(classification Jev avec la clé OpenRouter de l'utilisateur, saisie dans l'onglet Options et stockée
sous `openrouter:key` dans `chrome.storage.local`). Pas de backend, pas de permission `identity`.

## Organisation

| Chemin | Rôle |
| --- | --- |
| `src/background.ts` | Composition root du service worker : moteur (`@super-x/application`) + adaptateurs X, Chrome et OpenRouter ; alarmes `superx:tick` / `superx:act` ; commandes du panel. |
| `src/messages.ts` | Commandes panel → service worker (seul le service worker écrit l'état). |
| `src/sidepanel/store.tsx` | Lit `chrome.storage.local` (clé OpenRouter, état du compte X courant) et projette le view model. |
| `src/sidepanel/project.ts` | `EngineState` → `PanelState` (compteurs, journal, quotas). |
| `src/sidepanel/gates.tsx` | Écrans avant le panel : chargement, compte X à connecter sur x.com. |
| `src/style.css` | Tokens du DS (`:root` / `.dark`, `@theme inline`) + effets maison. Compilé par la CLI Tailwind vers `style.generated.css` (ignoré par git). |
| `src/components/ui/` | Composants shadcn ajustés selon `shadcn.md` du DS. |
| `src/components/sx/` | Composants du DS et composants métier. |

## Notes

- Les appels X partent d'un onglet x.com (MAIN world via `chrome.scripting`, ADR 0004). Sans onglet
  ouvert, un onglet épinglé est ouvert en arrière-plan. Aucun appel tant qu'aucune campagne ne tourne.
- L'état (campagnes, leads, file, quotas) est stocké par compte X dans `chrome.storage.local`, jamais sur un serveur.
- Tailwind v4 est pré-compilé par `@tailwindcss/cli` : le PostCSS de Parcel (Plasmo 0.90) ne sait pas charger `@tailwindcss/postcss`. Il ne scanne que `src/` (sinon `build/` et `.plasmo/` relancent le watcher en boucle).
- Les polices (Inter, DM Mono) sont embarquées via Fontsource : la CSP MV3 bloque Google Fonts.
- Le mode sombre suit `prefers-color-scheme` (classe `dark` sur `<html>`).
