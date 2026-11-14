# lead-dashboard-web — CRM, back-office et API (Cloudflare Pages)

Complète `AGENTS.md` à la racine, qui reste valable ici.

- **Point d'entrée** : `functions/[[route]].ts` monte l'application Hono de `src/app.ts` ; les routes sont dans
  `src/routes/`, les pages dans `src/views/` (chaînes HTML + script client inline).
- **Schéma** : toute modification suit `docs/agents/donnees-d1.md` (trois endroits à tenir ensemble).
- **Lancer en local avec toutes les liaisons** (photos R2 comprises) :
  `npx wrangler pages dev public --d1=DB --r2=MEDIA --port 8788 --persist-to=/tmp/lead-d1-state`.
- **Interface** : lire `docs/agents/interface-crm.md` avant de toucher à `src/views/`.
- **Secrets et variables lus par le dashboard** : `src/types.ts` (`Bindings`) fait foi ; procédure dans `docs/deploiement.md`.
- **Base locale en une commande** : `npm run db:local:reset` (à la racine ou ici ; arrêter `npm run dev` avant) recrée
  la base lue par `npm run dev:web` (`/tmp/lead-d1-state`), applique `schema.sql` puis `seed.sql` (jetons publics, local
  uniquement). Le script passe par `wrangler.local.toml` (`database_id = "DB"`) : avec le `database_id` de
  `wrangler.toml`, `wrangler d1 execute` écrirait dans un autre fichier SQLite que `pages dev`. Il refuse toute option
  (jamais `--remote`). Connexion locale sans mot de passe : cookie `lead_session=<access_token du seed>`.
