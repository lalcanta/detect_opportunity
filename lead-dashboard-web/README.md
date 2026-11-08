# lead-dashboard-web

Plateforme de closing (Cloudflare Pages Functions + Hono + D1). Reçoit les leads du Mac, sert les démos, suit les ouvertures, pilote les closers.

## Mise en route
```bash
npm install
npx wrangler d1 create lead-dashboard        # copier le database_id dans wrangler.toml
cp .env.example .dev.vars                    # puis éditer
# éditer seed.sql : remplacer les jetons (openssl rand -hex 24)
npm run db:init:local
npx wrangler d1 execute lead-dashboard --local --file=seed.sql
npm run dev                                  # http://localhost:8788  (connexion avec un jeton du seed)
```

## Production
```bash
npm run db:init:remote
npx wrangler d1 execute lead-dashboard --remote --file=seed.sql
npx wrangler pages secret put SYNC_SECRET_TOKEN   # idem STRIPE_SECRET_KEY, TELEGRAM_*, DISCORD_WEBHOOK_URL, PUBLIC_APP_URL
npm run deploy
```
Côté `lead-engine-cli/.env` : `REMOTE_APP_URL=https://<projet>.pages.dev` et le même `SYNC_SECRET_TOKEN`.

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
