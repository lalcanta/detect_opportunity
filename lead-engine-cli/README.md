# lead-engine-cli

Moteur de collecte (Mac) : Google Maps ou liste de domaines → audit → démo, flyer, battlecard → envoi vers le CRM
(`lead-dashboard-web`). Règles du projet et pièges : `AGENTS.md` (racine et ce dossier).

## Installation
```bash
npm install            # installe aussi Chromium pour Playwright (Node 22)
cp .env.example .env   # REMOTE_APP_URL, SYNC_SECRET_TOKEN, clés LLM utiles ; schéma complet : src/config.ts
npm run typecheck
```
Les commandes ci-dessous se lancent depuis la racine du dépôt (`npm run <script> -- <options>`) ou ici, sans le
préfixe. `--prod` vise `REMOTE_APP_URL_PROD`, `--local` le CRM local (`http://127.0.0.1:8788`).

## Commandes

| Commande | Rôle |
|---|---|
| `npm run worker` | Reste à l'écoute du CRM : scans demandés, planifications (heure de Paris), génération, envoi SMTP si `SMTP_HOST`. Il envoie un battement pendant chaque job ; `worker:prod` pour la production |
| `npm run scan` | Scan complet avec appels LLM (`scan:prod` pour la production) |
| `npm run prep` | Préparation sans LLM : dépose les dossiers dans `queue/pending/`, à compléter ensuite (`docs/agents/file-de-generation.md`) |
| `npm run sync-queue` | Pousse les dossiers complétés de `queue/` vers le CRM (`sync-queue:prod`) |

Piloté depuis le CRM, le worker suffit : un scan lancé dans l'interface y reste « en attente » tant qu'il ne tourne pas.
En production il tourne en continu sur le Mac ; après une fusion qui touche `lead-engine-cli/` ou `shared/`, le
redémarrer (`docs/deploiement.md`).

## Options

Une option inconnue arrête la commande avant toute action, avec une suggestion. Les listes font foi :
`SCAN_CLI_OPTIONS` (`src/utils/scanCliOptions.ts`) et `PREP_CLI_OPTIONS` (`src/prepScan.ts`).
`--prod`, `--remote`, `--local` et `--help` sont acceptées partout ; `worker` et `sync-queue` n'ont pas d'autre option.

- **`scan`** : `--query`, `--city`, `--limit`, `--domains` (liste de domaines sans Maps), `--opportunity`, `--target`,
  `--website-filter`, `--lat`, `--lng`, `--radius`, `--cdp`, `--dry-run`.
- **`prep`** : `--query` (`-q`), `--city` (`-c`), `--limit` (`-l`), `--domains` / `--urls` (`-d`), `--lat`, `--lng`,
  `--radius`, `--target` / `--need` / `--opportunity` (`-t`), `--filter` / `--website-filter`, `--pitch-focus`,
  `--cdp`. Les formes `--opt valeur` et `--opt=valeur` sont acceptées.

```bash
npm run scan -- --query "plombier" --city "Lyon" --limit 20
npm run prep -- --query "plombier" --city "Lyon" --limit 5
```

## Mode CDP (visible, captcha manuel)
Le mode headless abandonne la fiche en cas de captcha ; relancer en CDP.
1. Fermer complètement Chrome (Cmd+Q), puis le lancer avec le port de débogage et un profil dédié (obligatoire depuis
   Chrome 136) :
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --user-data-dir="$HOME/chrome-cdp-profile"
```
2. Vérifier : `curl http://localhost:9222/json/version`
3. Lancer : `npm run scan -- --query "électricien" --city "Marseille" --limit 10 --cdp`

En cas de captcha, le résoudre dans la fenêtre : le script reprend automatiquement (5 min max).

## Test sans synchronisation
`npm run scan -- … --dry-run` ne synchronise pas : il écrit `demo.html`, `flyer.pdf` et `lead.json` dans
`output/<id>/` (dossier ignoré par git ; le scan appelle quand même les LLM configurés).

## Modèles LLM
Plusieurs fournisseurs (Gemini, OpenAI, Anthropic, OpenRouter, Workers AI, mode `cli`) ; le modèle de chaque
action et ses modèles de secours se règlent dans le CRM (onglet « Modèles IA par action »). Sans secours configuré, le routeur retombe
sur Gemini 3 Flash. Les clés Gemini (`GEMINI_API_KEY_1`, `_2`) alternent, avec une pause par (clé, modèle) en cas de
quota ou d'indisponibilité (`src/llm/modelRouter.ts`).

## Notes
- Les sélecteurs Google Maps (`.hfpxzc`, `.DUwDvf`, `.jftiEf`…) changent périodiquement : à ajuster dans
  `src/collector/mapsScraper.ts`.
