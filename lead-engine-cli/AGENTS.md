# lead-engine-cli — moteur de collecte et de génération (Mac)

Complète `AGENTS.md` à la racine, qui reste valable ici.

- **Configuration** : `src/config.ts` (schéma zod) fait foi pour les variables du `.env` ; `--prod` remplace
  `REMOTE_APP_URL` par `REMOTE_APP_URL_PROD`, `--local` par le CRM local (`http://127.0.0.1:8788`) :
  `npm run worker -- --local`.
- **Options de ligne de commande** : chaque point d'entrée déclare ses options et appelle `assertKnownOptions`
  (`src/utils/cliArgs.ts`) ; une option inconnue arrête la commande avant toute action, avec une suggestion. Une
  nouvelle option se déclare dans la liste de son point d'entrée (`--prod`, `--remote`, `--local`, `--help` sont
  acceptées partout).
- **Worker** : `src/worker.ts` interroge le CRM (scans, planifications, génération, envoi SMTP si `SMTP_HOST`).
- **Workflow d'un lead** : `src/workflow/runner.ts` exécute les nœuds du besoin par vagues parallèles.
- **Consignes de texte** : la consigne des textes commerciaux (mode complet comme `prompt_battlecard.md` du mode
  préparation) est assemblée par `src/workflow/pitchPrompt.ts` à partir des nœuds exécutés (`pitchFacts.ts`).
  Ne pas la réécrire à la main dans `prepScan.ts` ni dans les générateurs.
- **Scan de test** : `npm run scan -- --query "…" --city "…" --limit 1 --dry-run` écrit dans `output/` sans
  synchroniser.
- **Sélecteurs Google Maps** (`.hfpxzc`, `.DUwDvf`…) : ils changent sans prévenir ; un scan qui ne trouve plus rien
  se corrige dans `src/collector/mapsScraper.ts`.
- **Captcha Maps** : le mode headless abandonne la fiche ; relancer en `--cdp` (procédure dans `README.md`).
- **File de génération** (`queue/pending/<id>/`) : procédure dans `docs/agents/file-de-generation.md`.
