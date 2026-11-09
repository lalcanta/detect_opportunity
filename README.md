# detect_opportunity — LeadEngine

Système d'acquisition B2B automatisé : détection de prospects locaux (Google Maps ou liste de domaines),
audit de leur présence web, génération d'une preuve personnalisée (démo de site, rapport RGPD), puis closing
par une équipe de téléprospecteurs dans un CRM hébergé sur Cloudflare.

| Dossier | Contenu |
|---|---|
| [`lead-engine-cli/`](lead-engine-cli/README.md) | Moteur local (Mac) : scraping, inspection, LLM, flyer, worker, file de préparation |
| [`lead-dashboard-web/`](lead-dashboard-web/README.md) | CRM, back-office admin et API (Hono, Cloudflare Pages, D1, Workers AI) |
| `agency-landing-web/` | Landing publique de l'agence (capture de leads entrants) |
| `tests/` | Tests fonctionnels HTTP (serveur local sur le port 8789) |

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) : composants, modes d'exécution, cycle de vie d'un lead, API, configuration
- [`docs/AUDIT_2026-11.md`](docs/AUDIT_2026-11.md) : incohérences et bugs connus, avec priorités
- [`DEPLOYMENT_GUIDE.md`](DEPLOYMENT_GUIDE.md) : déploiement Cloudflare Pages (voir l'audit §6 pour les écarts)
- [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) / [`DESIGN_ARCHETYPES.md`](DESIGN_ARCHETYPES.md) : UI du CRM / direction artistique des démos
- [`.agents/skills/leadengine/SKILL.md`](.agents/skills/leadengine/SKILL.md) : workflow « 0 € » avec Antigravity

## Démarrage rapide

```bash
npm --prefix lead-engine-cli install && npm --prefix lead-dashboard-web install
npm run dev:web                     # CRM local sur http://localhost:8788
npm run worker                      # worker local piloté par le CRM
npm run prep -- --query "plombier" --city "Lyon" --limit 5   # préparation 0 € puis génération par Antigravity
npm run sync-queue                  # envoi des dossiers complétés
npm run typecheck && npm test
```
