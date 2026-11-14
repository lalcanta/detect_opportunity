# lead-dashboard-web — CRM, back-office et API (Cloudflare Pages)

Complète `AGENTS.md` à la racine, qui reste valable ici.

- **Point d'entrée** : `functions/[[route]].ts` monte l'application Hono de `src/app.ts` ; les routes sont dans
  `src/routes/`, les pages dans `src/views/` (chaînes HTML + script client inline).
- **Schéma** : toute modification suit `docs/agents/donnees-d1.md` (trois endroits à tenir ensemble).
- **Lancer en local** : `npm run dev` (ou `npm run dev:web` à la racine) ; Node 22 requis. Le script s'exécute avec
  `--cwd=dev-local` : ce dossier (son propre `package.json`, sinon wrangler remonte lire `wrangler.toml`) contient des
  liens vers `wrangler.local.toml`, `functions/` et `.dev.vars`. `wrangler pages dev` refuse `--config` : ce dossier
  est le moyen d'avoir une config locale sans `AI` (voir `AGENTS.md` à la racine).
- **Interface** : lire `docs/agents/interface-crm.md` avant de toucher à `src/views/`.
- **Secrets et variables lus par le dashboard** : `src/types.ts` (`Bindings`) fait foi ; procédure dans `docs/deploiement.md`.
- **Base locale en une commande** : `npm run db:local:reset` (à la racine ou ici ; arrêter `npm run dev` avant) vide toute la base locale puis recrée
  la base lue par `npm run dev:web` (`/tmp/lead-d1-state`), applique `schema.sql` puis `seed.sql` (jetons publics, local
  uniquement). Le script passe par `wrangler.local.toml` (`database_id = "DB"`) : avec le `database_id` de
  `wrangler.toml`, `wrangler d1 execute` écrirait dans un autre fichier SQLite que `pages dev`. Il refuse toute option
  (jamais `--remote`). Connexion locale sans mot de passe : cookie `lead_session=<access_token du seed>`.
