# lead-engine-cli — moteur de collecte et de génération (Mac)

Complète `AGENTS.md` à la racine, qui reste valable ici.

- **Configuration** : `src/config.ts` (schéma zod) fait foi pour les variables du `.env` ; `--prod` remplace
  `REMOTE_APP_URL` par `REMOTE_APP_URL_PROD`, `--local` par le CRM local (`http://127.0.0.1:8788`) :
  `npm run worker -- --local`.
- **Worker** : `src/worker.ts` interroge le CRM (scans, planifications, génération, envoi SMTP si `SMTP_HOST`).
- **Workflow d'un lead** : `src/workflow/runner.ts` exécute les nœuds du besoin par vagues parallèles.
- **Scan de test** : `npm run scan -- --query "…" --city "…" --limit 1 --dry-run` écrit dans `output/` sans
  synchroniser.
- **Sélecteurs Google Maps** (`.hfpxzc`, `.DUwDvf`…) : ils changent sans prévenir ; un scan qui ne trouve plus rien
  se corrige dans `src/collector/mapsScraper.ts`.
- **Captcha Maps** : le mode headless abandonne la fiche ; relancer en `--cdp` (procédure dans `README.md`).
- **File de génération** (`queue/pending/<id>/`) : procédure dans `docs/agents/file-de-generation.md`.
