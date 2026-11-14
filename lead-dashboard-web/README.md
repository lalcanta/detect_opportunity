# lead-dashboard-web

Plateforme de closing (Cloudflare Pages Functions + Hono + D1). Reçoit les leads du Mac, sert les démos, suit les ouvertures, pilote les closers.

## Mise en route
```bash
npm install
npx wrangler d1 create lead-dashboard-db     # copier le database_id dans wrangler.toml
cp .env.example .dev.vars                    # puis éditer
npm run db:local:reset                       # crée la base locale + comptes de démo LOCAUX (jetons publics, jamais en prod)
npm run dev                                  # http://localhost:8788
```

## Production
Première installation, secrets et livraison : [`docs/deploiement.md`](../docs/deploiement.md).
⚠️ Ne jamais exécuter `seed.sql` en prod : ses jetons sont versionnés.

## Endpoints
| Route | Accès |
|---|---|
| `POST /api/sync` | Bearer `SYNC_SECRET_TOKEN` |
| `GET /demos/:id` | public (id non devinable) |
| `GET /api/tracker/open?leadId=` | public, ignore les bots/prévisualisations, alerte max 1/30 min/lead |
| `POST /api/leads/:id/lock` · `/status` | closer connecté |
| `GET /api/leads/:id/flyer` | connecté |
| `POST /api/admin/assign` · `/users` · `GET /api/admin/stats` | admin |

## Limites connues
- D1 plafonne à ~2 Mo par ligne : démo HTML + flyer PDF base64 y tiennent, mais R2 est recommandé à grande échelle.
- `phone_quota_weekly` est stocké et affiché, pas encore appliqué.
- Authentification simplifiée par jeton/cookie ; pour la production, envisager Cloudflare Access.
