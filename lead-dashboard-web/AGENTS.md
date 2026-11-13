# lead-dashboard-web — CRM, back-office et API (Cloudflare Pages)

Complète `AGENTS.md` à la racine, qui reste valable ici.

- **Point d'entrée** : `functions/[[route]].ts` monte l'application Hono de `src/app.ts` ; les routes sont dans
  `src/routes/`, les pages dans `src/views/` (chaînes HTML + script client inline).
- **Schéma** : toute modification suit `docs/agents/donnees-d1.md` (trois endroits à tenir ensemble).
- **Jamais `seed.sql` en production** (jetons publics versionnés). Si c'est arrivé :
  `npm run db:rotate-seed-credentials:remote`.
- **Lancer en local avec toutes les liaisons** (photos R2 comprises) :
  `npx wrangler pages dev public --d1=DB --r2=MEDIA --port 8788 --persist-to=/tmp/lead-d1-state`.
- **Interface** : lire `docs/agents/interface-crm.md` avant de toucher à `src/views/`.
- **Secrets et variables lus par le dashboard** : `src/types.ts` (`Env`) fait foi ; procédure dans `docs/deploiement.md`.
