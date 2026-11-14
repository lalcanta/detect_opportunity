# lead-dashboard-web

CRM et back-office de closing (Cloudflare Pages Functions, Hono, D1, R2). Reçoit les leads du moteur, sert les démos,
suit les ouvertures, pilote les closers. Règles du projet : `AGENTS.md` (racine et ce dossier).

## Développement local
Node 22 requis (wrangler 4).
```bash
npm install
cp .env.example .dev.vars   # puis éditer
npm run db:local:reset      # crée la base locale + comptes de démo LOCAUX (jetons publics, jamais en prod)
npm run dev                 # http://localhost:8788 (ou npm run dev:web à la racine)
```
`npm run dev` lance wrangler depuis `dev-local/`, avec D1 et un bucket R2 local, mais sans Workers AI (liaison distante et facturée
en wrangler 4) : la génération par Workers AI n'y est pas testable (détails : `AGENTS.md` ici).
`npm run db:local:reset` recrée la base : arrêter `npm run dev` avant. Elle ne touche jamais la production.

## Tests
`npm test` : typecheck puis tests du dashboard. Les tests unitaires de tout le dépôt et les tests fonctionnels
(`npm run test:functional` à la racine, serveur sur le port 8789) tournent aussi en CI.

## Production
Première installation, secrets, livraison et retour arrière : [`docs/deploiement.md`](../docs/deploiement.md).
Ne jamais exécuter `seed.sql` en production : ses jetons sont versionnés.

## Routes
Pas de liste à maintenir ici : le code fait foi. `src/app.ts` monte un fichier par famille dans `src/routes/` :

| Fichier | Famille |
|---|---|
| `public.ts` | `POST /api/sync` (jeton `SYNC_SECRET_TOKEN`), `/demos/:id`, suivi `/api/tracker/*`, lead entrant public, `/landing` |
| `pages.ts` | pages du CRM : `/`, `/admin`, `/login`, `/logout`, `/invite/:code` |
| `leads.ts` | `/api/leads/:id/*` (statut, verrou, notes…), agenda du closer |
| `admin.ts` | `/api/admin/*` : attribution, utilisateurs, statistiques, modèles et quotas |
| `scans.ts` | `/api/admin/scans`, `/api/admin/scheduled-scans`, `/api/worker/*` (file de jobs du worker) |
| `opportunities.ts` | `/api/admin/opportunities` (besoins) et `/api/worker/opportunities` |
| `emails.ts` | envoi d'emails (`/api/email/*`, `/api/worker/emails`) |
| `authGoogle.ts` | connexion et agenda Google (`/auth/google*`, `/api/closer/google-*`) |

## Limites connues
- D1 plafonne à ~2 Mo par ligne ; les médias passent par R2 (`lead-media`).
- `phone_quota_weekly` est stocké et affiché, pas encore appliqué.
- Authentification par jeton/cookie ; pour la production, envisager Cloudflare Access.
