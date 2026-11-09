# lead-dashboard-web

Plateforme de closing (Cloudflare Pages Functions + Hono + D1). Reçoit les leads du Mac, sert les démos, suit les ouvertures, pilote les closers.

## Mise en route
```bash
npm install
npx wrangler d1 create lead-dashboard        # copier le database_id dans wrangler.toml
cp .env.example .dev.vars                    # puis éditer
npm run db:init:local
npm run db:seed:local                        # comptes de démo LOCAUX (jetons publics, jamais en prod)
npm run dev                                  # http://localhost:8788
```

## Production
⚠️ Ne jamais exécuter `seed.sql` en prod : ses jetons sont versionnés. Si c'est déjà arrivé, lancer
`npm run db:rotate-seed-credentials:remote` (déconnecte ces sessions et régénère les codes d'invitation).
```bash
npm run db:init:remote
# Premier admin (jeton et invitation aléatoires), puis ouvrir /invite/<invite_code> pour choisir le mot de passe :
npx wrangler d1 execute lead-dashboard-db --remote --command "INSERT INTO users (id, name, email, role, phone_quota_weekly, invite_code, access_token) VALUES ('u_admin', 'Admin', 'vous@domaine.fr', 'admin', 0, 'inv_' || lower(hex(randomblob(16))), 'tok_' || lower(hex(randomblob(24))))"
npx wrangler d1 execute lead-dashboard-db --remote --command "SELECT invite_code FROM users WHERE id = 'u_admin'"
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
