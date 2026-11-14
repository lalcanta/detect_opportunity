# Architecture & Workflows — LeadEngine (detect_opportunity)

> Document de référence fonctionnel et technique. Rédigé à partir du code (état au 9 novembre 2026, commit `e7b7406`).
> Pour les anomalies relevées, voir [`AUDIT_2026-11.md`](./AUDIT_2026-11.md).

## 1. Ce que fait le système

Détection automatisée de prospects B2B locaux (artisans, commerces, agences), production d'une **preuve personnalisée**
(démo de site, rapport d'audit RGPD), puis pilotage du **closing** par des téléprospecteurs (« closers ») dans un CRM web.

```
Google Maps / liste de domaines
        │  (Playwright, Mac)
        ▼
 Qualification ─► Inspection du site ─► Audit ─► Démo / Rapport ─► Battlecard ─► Flyer PDF
        │                                   (LLM ou Antigravity)
        ▼
  POST /api/sync  ──►  D1 (Cloudflare)  ──►  Kanban closer  ──►  Appel / email  ──►  (paiement : à venir)
                              ▲
                 /api/tracker/open (ouverture de la démo par le prospect → « lead chaud »)
```

## 2. Composants

| Dossier | Rôle | Exécution |
|---|---|---|
| `lead-engine-cli/` | Moteur de collecte et de génération (scraping Maps, inspection, LLM, flyer, sync) | Mac local (Node + Playwright) |
| `lead-dashboard-web/` | CRM / back-office / API (Hono sur Cloudflare Pages Functions + D1 + Workers AI) | Cloudflare Pages |
| `agency-landing-web/` | Landing publique de l'agence (3 offres + formulaire « rappel ») | Statique, poste sur `/api/public/inbound-lead` |
| `tests/` | Tests fonctionnels HTTP contre un `wrangler pages dev` local (port 8789) | Local uniquement (hors CI) |
| `.agents/skills/` | Skills Antigravity : `leadengine` (workflow 0 €) et `artisan-frontend-craft` (règles de design) | Agent IA local |
| `DESIGN_SYSTEM.md` / `DESIGN_ARCHETYPES.md` | Design system du CRM / archétypes visuels des démos par métier | Doc |

Il n'y a **pas de canal entrant** vers le Mac : le worker interroge le dashboard (polling 10 s) et pousse ses résultats.

## 3. Les trois modes d'exécution

### 3.1 `full_auto` — cycle complet (LLM via API)
Point d'entrée : `npm run scan` (CLI direct) ou job `full_auto` récupéré par `npm run worker`.
Code : `lead-engine-cli/src/scanRunner.ts`.

1. **Collecte** (`collector/mapsScraper.ts`) : recherche Maps (une par sous-requête séparée par `,`/`;`), vivier de
   `max(limit×3, 60)` fiches, puis extraction fiche par fiche jusqu'à atteindre `limit` prospects **qualifiés**.
   Qualification en deux temps selon les prérequis de l'opportunité (`requirements` dans `shared/opportunities/`,
   `evaluateRequirements`) : sur la fiche Maps (téléphone, site), puis après l'inspection (email, formulaire de
   contact). Un lead rejeté après inspection n'est ni généré ni synchronisé. Le filtre de site (`website_filter`) est
   déduit de l'opportunité ; l'admin peut seulement le restreindre. Le canal principal du lead (`primary_channel`)
   est le premier canal disponible de l'opportunité ; ses contacts vont dans `lead_contacts`.
   Variante : `--domains "a.fr, b.fr"` (ou requête `domains:...`) court-circuite Maps (`parseDirectDomainLeads`).
2. **Inspection** (`inspector/siteInspector.ts`) : une seule ouverture de page ; les modules actifs dépendent de
   l'opportunité (`scanModules` dans `shared/opportunities/definitions/`) : traceurs/CMP, pixels pub, stack,
   fraîcheur/SSL, emails/dirigeants, réseaux sociaux, SIREN (API recherche-entreprises), branding (couleurs, logo
   base64, capture), perf mobile. Sans site : seul le lookup SIREN est fait.
3. **Audit** (`inspector/siteAuditor.ts`) : LLM (tâche `audit`) sur capture + mesures, fallback déterministe.
4. **Démo** (`generator/demoGenerator.ts`) : LLM (tâche `demo`) → HTML Tailwind ; réinjection du vrai logo,
   `no-referrer`, **injection du pixel de tracking** `/api/tracker/open`.
5. **Flyer** (`generator/flyerGenerator.ts`) : PDF A5 avec QR code vers le formulaire d'avis Google du prospect.
   Désactivé pour toutes les opportunités depuis la phase 1 (`flyer: false`), réactivable par opportunité.
6. **Battlecard** (`copywriter/battlecard.ts`) : LLM (tâche `battlecard`) → brief closer, avantages, script,
   objections, WhatsApp, brouillon d'email.
7. **Sync** (`sync/pushLead.ts`) : `POST /api/sync` (3 tentatives, pas de retry sur 4xx).

Cas particulier `audit_qa_trackers` : étapes 3, 4 et 6 **sans LLM** (rapport `trackerReportGenerator.ts` + cold
email déterministe `buildDeterministicQaBattlecard`), pas de flyer.

### 3.2 `prep_only` — préparation locale « 0 € » + génération par Antigravity
Point d'entrée : `npm run prep` ou job `prep_only`. Code : `lead-engine-cli/src/prepScan.ts` puis `syncQueue.ts`.

1. Collecte + inspection comme ci-dessus (sans LLM).
2. Écrit `queue/pending/<id>/` : `meta.json` (avec `primary_channel` et `contacts`), `screenshot.png`, `prompt_demo.md`,
   `prompt_battlecard.md` (assemblée par `workflow/pitchPrompt.ts` à partir des nœuds exécutés ; + `demo.html` et `battlecard.json` déterministes si `audit_qa_trackers`).
3. Pousse immédiatement le lead au CRM en `status = pending_generation` (onglet « file de génération » de l'admin,
   masqué du Kanban).
4. **Humain + agent** : on demande à Antigravity « Génère les démos et battlecards des leads en attente » ; il suit
   `docs/agents/file-de-generation.md` et écrit `demo.html` + `battlecard.json`.
5. `npm run sync-queue[:prod]` : pour chaque dossier complet, normalise la battlecard, repousse le lead (statut
   `demo_ready`) et déplace le dossier dans `queue/completed/`.

### 3.3 Lead entrant volontaire
`agency-landing-web` → `POST /api/public/inbound-lead` : crée directement un lead `hot_lead`, assigné à `u_admin`,
rappel programmé à +1 h (ou au créneau choisi), battlecard et « démo » placeholder générées côté serveur.

## 4. Pilotage depuis le dashboard

| Action admin | Effet |
|---|---|
| Nouveau scan | `INSERT scan_jobs (status='queued', execution_mode)` |
| Worker `POST /api/worker/claim` | Passe le plus ancien job `queued` en `running` (UPDATE…RETURNING) + renvoie `model_settings` |
| Progression | `POST /api/worker/jobs/:id/progress` ; la réponse `{cancel:true}` stoppe le worker |
| Annuler | `status='cancelled'` (pris en compte au prochain rapport de progression) |
| Planification | Table `scheduled_scans` ; le **worker** décide de l'échéance (heure de Paris, fenêtre de 2 h après `time_of_day`) puis appelle `…/trigger`, seul à écrire `last_run_at` (« Lancer maintenant » n'y touche pas) ; la vérification tourne dans sa propre boucle (30 s), pas bloquée par un scan. Limite : la fenêtre ne passe pas minuit (un passage prévu à 22 h ou plus n'a que le reste de la journée de Paris) ; une heure illisible refuse la planification, avec un log par jour |
| Modèles IA | `model_settings` (demo / audit / battlecard) poussés au worker à chaque claim |
| Catalogue modèles | Le worker pousse au démarrage une liste statique + modèles Gemini découverts (`/api/worker/models/sync`) |
| Coupe-circuit | `POST /api/admin/models/circuit-breaker` (voir audit : n'arrête pas réellement les appels) |
| Cockpit quotas | Agrège `token_usage` par modèle et estime coûts / neurones Cloudflare |

### Routage LLM (`lead-engine-cli/src/llm/modelRouter.ts`)
Providers : `cloudflare` (par défaut, via `POST /api/worker/ai/run` → binding `AI` du dashboard, texte seul),
`gemini` (2 clés en round-robin, cooldown 60 s par (clé, modèle) sur 429/503/404, repli `gemini-3-flash-preview`),
`openai`, `openrouter`, `anthropic`. Toute erreur d'un provider non-Gemini → repli Gemini.

## 5. Cycle de vie d'un lead

```
pending_generation ──(sync-queue)──► demo_ready ──(démo ouverte / clic « ça me plaît »)──► hot_lead
                                         │                                                  │
                                         └────────────► called ◄─────────────────────────────┘
                                                          │
                                         callback_scheduled ◄──► called
                                                          │
                                                   won  /  lost (démo révoquée)
```

- **Verrou d'appel** : `POST /api/leads/:id/lock` → 15 min, atomique (`UPDATE … WHERE locked_until < now`).
- **Expiration de démo** : armée à `now + 5 j` à la 1re ouverture, au clic d'intérêt, ou au passage `called` /
  `callback_scheduled`. `lost` révoque. L'admin/closer peut prolonger, révoquer ou rendre illimitée.
- **Clôture** : un closer ne peut plus modifier un lead `won`/`lost` ; l'admin oui.
- **Attribution** : manuelle ou round-robin « moins chargé » parmi les closers dont `allowed_opportunities` contient
  le type du lead (auto à chaque sync si `AUTO_ASSIGN=true`).
- **Visibilité** : un closer ne voit que ses leads assignés et ses types d'opportunités ; l'admin voit tout
  (`scope=all|mine|unassigned`).

## 6. Types d'opportunité

Définis une seule fois dans `shared/opportunities/` (un fichier par opportunité dans `definitions/`, registre dans
`index.ts`), importé par le CLI et par le dashboard. Chaque définition déclare ses canaux, ses vérifications de site,
sa preuve, son message et le flyer. Le CLI exécute les générateurs déclarés (`lead-engine-cli/src/opportunities/generators.ts`) ;
le dashboard en dérive badges, sélecteurs et mode de l'écran du closer (`lead-dashboard-web/src/types.ts`).
La cohérence du registre est vérifiée par `shared/opportunities/registry.test.ts`.
Refonte en cours : [`PLAN_REFONTE_LEADS.md`](./PLAN_REFONTE_LEADS.md).

| id | Canal (dashboard) | Preuve générée par le CLI |
|---|---|---|
| `website` | Appel closer | Démo de site |
| `audit_qa_trackers` | Email asynchrone (dev à dev) | Rapport traceurs déterministe |
| `google_reviews` | Appel closer | Démo de site (full_auto) / démo orientée avis (prep) |
| `seo_local` | Appel closer | Bilan de visibilité locale (`visibility_report`) + démo de site conditionnelle (`site_demo`, `complementDemo`) |
| `ads_acquisition` | Appel closer | Bilan d'acquisition (`acquisition_report`) + démo de site conditionnelle (`site_demo`, `complementDemo`) |
| `custom` | Email asynchrone | Démo de site + script d'appel |

## 7. Modèle de données (D1)

`users` (rôle, whitelist email, mot de passe PBKDF2, `access_token` = jeton de session, tokens Google Agenda,
`allowed_opportunities`) · `leads` (identité, audit JSON, démo HTML, flyer base64, battlecard JSON, attribution,
verrou, statut, relance, expiration démo) · `token_usage` · `scan_jobs` · `scheduled_scans` · `model_settings` ·
`available_models`.

Schéma de base : `lead-dashboard-web/schema.sql`. Les colonnes ajoutées après coup sont créées à chaud par
`ensureAuthSchema()` (`src/auth.ts`) à chaque premier appel d'un isolate. Les changements impossibles à faire à chaud
(contraintes CHECK) passent par `lead-dashboard-web/migrations/`, lancées à la main (voir `docs/agents/donnees-d1.md`).

Règle de synchronisation : `POST /api/sync` est un upsert qui **ne modifie jamais le statut d'un lead déjà généré**.
Seul un lead `pending_generation` avance vers le statut envoyé ; une re-préparation ne remplace pas son audit.

Identifiant d'un lead : `sha1(nom | téléphone ?? URL Maps)` tronqué à 16 hex (`utils/helpers.ts → leadId`).

## 8. API (récapitulatif)

| Route | Auth | Rôle |
|---|---|---|
| `POST /api/sync` | Bearer `SYNC_SECRET_TOKEN` | Upsert d'un lead depuis le Mac |
| `POST /api/worker/claim` · `/jobs/:id/progress` · `/ai/run` · `/models/sync` | Bearer | Worker |
| `GET /api/worker/scheduled-scans` · `POST …/:id/trigger` | Bearer | Planifications |
| `GET /demos/:id` | Public | Démo + bandeau d'intérêt (410 si expirée/révoquée) |
| `GET /api/tracker/open` · `POST /api/tracker/interest` | Public (CORS *) | Tracking prospect |
| `POST /api/public/inbound-lead` | Public (CORS *, honeypot) | Lead entrant |
| `POST /api/leads/:id/lock` · `/status` · `/update` · `/demo-access` · `/email-sent` | Session closer/admin | Pipeline |
| `GET /api/leads/:id` · `/flyer` · `/calendar.ics` · `GET /api/closer/calendar.ics` | Session | Lecture |
| `/api/admin/*` | Session admin | Scans, utilisateurs, attribution, modèles, stats |
| `/login` · `/invite/:code` · `/auth/google/*` | — | Authentification |

## 9. Configuration

**`lead-engine-cli/.env`** : `GEMINI_API_KEY_1/2`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `ANTHROPIC_API_KEY`,
`OPENROUTER_API_KEY`, `THINKING_BUDGET_HEAVY`, `REMOTE_APP_URL`, `REMOTE_APP_URL_PROD`, `SYNC_SECRET_TOKEN`, `CDP_URL`.
Flags : `--prod` / `--remote` (→ `REMOTE_APP_URL_PROD` ou `https://lead-dashboard-8bx.pages.dev`), `--local`
(→ `http://127.0.0.1:8788`).

**Dashboard (`.dev.vars` / secrets Pages)** : `SYNC_SECRET_TOKEN`, `PUBLIC_APP_URL`, `TELEGRAM_BOT_TOKEN`,
`TELEGRAM_CHAT_ID`, `DISCORD_WEBHOOK_URL`, `STRIPE_SECRET_KEY`, `STRIPE_AMOUNT_CENTS`, `STRIPE_PRODUCT_NAME`,
`AUTO_ASSIGN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. Bindings : `DB` (D1 `lead-dashboard-db`), `AI`.
`SESSION_SECRET` et `WHITELIST_EMAILS` (cités par l'ancien guide de déploiement) **ne sont lus nulle part** ; la whitelist
est la table `users`.

## 10. Commandes

| Commande (racine) | Effet |
|---|---|
| `npm run scan[:prod] -- --query … --city … [--limit] [--opportunity] [--website-filter] [--lat --lng --radius] [--cdp] [--dry-run]` | Cycle complet direct |
| `npm run prep[:prod] -- …` | Préparation locale `queue/pending` |
| `npm run sync-queue[:prod]` | Envoi des dossiers complétés |
| `npm run worker[:prod]` | Worker piloté par le dashboard |
| `npm --prefix lead-engine-cli run regen:demos:prod` | Régénère les démos de **tous** les leads de prod via Workers AI |
| `npm run dev:web` | Dashboard local (port 8788, état D1 dans `/tmp/lead-d1-state`) |
| `npm run typecheck` · `npm test` · `npm run test:functional` | Qualité (les tests fonctionnels exigent un serveur sur 8789) |

## 11. CI / déploiement

- GitHub Actions (`.github/workflows/ci-cd.yml`) : install, typecheck, `npm test` (tests unitaires uniquement).
  **Plus aucun déploiement** depuis Actions (commit `701c315`).
- Déploiement : build natif Cloudflare Pages connecté au dépôt (le build exécute aussi les tests du dashboard).
