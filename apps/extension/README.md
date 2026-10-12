# @super-x/extension

Extension Chrome (Plasmo, MV3) : side panel React construit sur le design system **Cash Boost**
— shadcn/ui new-york + finition Rerun + bleu X.

```bash
pnpm key        # génère .secrets/extension-key.pem et affiche CRX_PUBLIC_KEY + l'ID de l'extension
pnpm dev        # Tailwind en watch + plasmo dev → charger build/chrome-mv3-dev dans chrome://extensions
pnpm build      # build/chrome-mv3-prod (lit .env.production)
pnpm package    # zip prêt pour le Chrome Web Store
pnpm test       # vitest
pnpm typecheck
```

## Configuration

Copier `.env.example` vers `.env.development` (dev) et `.env.production` (build) :

| Variable | Rôle |
| --- | --- |
| `PLASMO_PUBLIC_BACKEND_URL` | URL du backend (`apps/backend`), sans `/` final. Ajoutée aux `host_permissions`. |
| `CRX_PUBLIC_KEY` | Clé publique → ID d'extension fixe. Indispensable : la connexion Google revient sur `https://<id>.chromiumapp.org/` et le backend n'accepte que les IDs listés dans `EXTENSION_IDS`. |

La clé privée est écrite dans `.secrets/`, à ne jamais committer.
Pour le Chrome Web Store, le store impose sa propre clé : copier la clé publique affichée dans le
tableau de bord du store dans `.env.production`, et ajouter ce second ID à `EXTENSION_IDS`.

## Organisation

| Chemin | Rôle |
| --- | --- |
| `src/background.ts` | Composition root du service worker : moteur (`@super-x/application`) + adaptateurs X, Chrome et backend ; alarmes `superx:tick` / `superx:act` ; commandes du panel. |
| `src/messages.ts` | Commandes panel → service worker (seul le service worker écrit l'état). |
| `src/sidepanel/store.tsx` | Lit `chrome.storage.local` (session, accès, config, état du compte X courant) et projette le view model. |
| `src/sidepanel/project.ts` | `EngineState` → `PanelState` (compteurs, journal, quotas). |
| `src/sidepanel/gates.tsx` | Écrans avant le panel : connexion Google, compte X, accès terminé (licence / élève). |
| `src/style.css` | Tokens du DS (`:root` / `.dark`, `@theme inline`) + effets Rerun. Compilé par la CLI Tailwind vers `style.generated.css` (ignoré par git). |
| `src/components/ui/` | Composants shadcn ajustés selon `shadcn.md` du DS. |
| `src/components/sx/` | Langage Rerun et composants métier. |

## Notes

- Les appels X partent d'un onglet x.com (MAIN world via `chrome.scripting`, ADR 0004). Sans onglet
  ouvert, un onglet épinglé est ouvert en arrière-plan. Aucun appel tant qu'aucune campagne ne tourne.
- L'état (campagnes, leads, file, quotas) est stocké par compte X dans `chrome.storage.local`, jamais côté serveur.
- Tailwind v4 est pré-compilé par `@tailwindcss/cli` : le PostCSS de Parcel (Plasmo 0.90) ne sait pas charger `@tailwindcss/postcss`. Il ne scanne que `src/` (sinon `build/` et `.plasmo/` relancent le watcher en boucle).
- Les polices (Inter, DM Mono) sont embarquées via Fontsource : la CSP MV3 bloque Google Fonts.
- Le mode sombre suit `prefers-color-scheme` (classe `dark` sur `<html>`).
