# Bilans visibilité locale et acquisition — plan de réalisation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner aux besoins `seo_local` et `ads_acquisition` leur propre preuve : un bilan chiffré, sans IA, comparé aux concurrents réels du prospect, avec une démo de site en complément seulement quand le site est en cause.

**Architecture:** Le scan conserve rang et concurrents Maps, un nouveau module lit le référencement du site, une requête légère relève les pixels des concurrents. Deux générateurs déterministes produisent le bilan (preuve principale, `leads.demo_html`, `/demos/:id`) ; un nœud de workflow conditionnel produit la démo de site (`leads.site_demo_html`, `/demos/:id/site`). Les définitions des deux besoins sont basculées en base au déploiement.

**Tech Stack:** TypeScript, Node 22 + Playwright (`lead-engine-cli`), Hono sur Cloudflare Pages + D1 (`lead-dashboard-web`), `shared/` sans dépendance, tests `node:test` lancés par `tsx`.

**Spec:** `docs/superpowers/specs/2026-11-13-bilans-visibilite-acquisition-design.md` (à lire avant toute tâche), et `AGENTS.md` (règles du dépôt).

## Global Constraints

- Aucun chiffre non mesuré dans un bilan : ni appels perdus, ni chiffre d'affaires, ni trafic.
- Concurrents : uniquement données publiques (nom, note, nombre d'avis, rang, pixels trouvés sur leur site).
- Toujours afficher la recherche Maps **telle qu'elle a été lancée** et la date du constat.
- Score visibilité : position 35, avis 30, fiche 10, site 25. Score acquisition : suivi et pixels 40, page d'arrivée 40, comparaison concurrents 20.
- Critère non mesurable : retiré du total (score ramené sur 100). « Pas de site » = site 0/25 et critère « site relié » de la fiche retiré ; donc ≤ 75/100.
- Détail du score au survol (et au toucher sur mobile) : chaque critère, points obtenus / maximum, et critères retirés.
- Démo complémentaire `auto` : visibilité → pas de site, ou `isResponsive === false`, ou métier et ville absents du titre **et** du H1, ou `loadTimeMs > 3000` ; acquisition → ni lien `tel:` ni formulaire, ou `isResponsive === false`, ou `loadTimeMs > 3000`.
- Pixels des concurrents : requête HTTP simple, délai 5 s ; échec = « non vérifié », jamais « aucun pixel ».
- Lien bibliothèque publicitaire Meta : fiche du closer uniquement, jamais dans le bilan.
- `shared/` : aucune API Node ni Cloudflare hors tests (`shared/AGENTS.md`). Schéma : trois endroits (`docs/agents/donnees-d1.md`).
- Toute donnée insérée dans le HTML d'un bilan passe par `escapeHtml` (`lead-engine-cli/src/utils/helpers.ts`).
- Langue : interface, doc, commits en français, `type(portée): description`. Une branche, une PR vers `main`.

## Review Focus

1. **Lead premier sur Maps** (aucune fiche au-dessus) : la section position le dit et liste les suivants ; pas de tableau vide. → test Task 1 et Task 5.
2. **Scan par liste de domaines** (pas de recherche Maps) : pas de section position, critère position retiré du score, bilan complet sinon. → test Task 4 et Task 5.
3. **Site concurrent lent ou en erreur** : « non vérifié », compté comme non mesuré dans la comparaison. → test Task 3 et Task 4.
4. **Prospect sans site en `seo_local`** : site 0/25, score ≤ 75, démo complémentaire demandée. → test Task 4 et Task 6.
5. **Noms et titres avec `<`, `&`, guillemets** (fiches Maps, balises du site) : échappés dans le bilan et l'infobulle. → test Task 5.

---

### Task 1: Rang et concurrents Maps

**Files:**
- Modify: `lead-engine-cli/src/types.ts` (`MapsLead`), `lead-engine-cli/src/collector/mapsScraper.ts`
- Create: `lead-engine-cli/src/collector/mapsRanking.ts`
- Test: `lead-engine-cli/src/tests/mapsRanking.test.ts`

**Interfaces:**
- Produces:
  - `interface MapsCompetitor { name: string; rank: number; rating: number | null; reviewsCount: number | null; website: string | null; category: string | null }`
  - `MapsLead` gagne `mapsRank?: number | null; mapsQuery?: string | null; mapsCheckedAt?: string | null; competitors?: MapsCompetitor[]`
  - `pickCompetitors(places: MapsCompetitor[], leadRank: number, max = 5): MapsCompetitor[]` — mieux classés d'abord (rang croissant), complété par les suivants les plus proches, sans le lead.
  - `searchLabel(subQuery: string, city: string, fromCoords: boolean): string` — `"plombier Lyon"` si la sous-requête contient déjà la ville, `"plombier Lyon"` (ajout de la ville) sinon, `"plombier autour de Lyon"` si `fromCoords`.

- [ ] **Step 1: Tests** `pickCompetitors` : lead rang 4 sur 8 places → rangs `[1,2,3,5,6]` ; lead rang 1 → `[2,3,4,5,6]` ; moins de 5 places → toutes sauf le lead. `searchLabel` : les trois cas ci-dessus, casse et accents de la ville ignorés pour la détection.
- [ ] **Step 2:** `npx tsx --test lead-engine-cli/src/tests/mapsRanking.test.ts` → FAIL (module absent).
- [ ] **Step 3:** Implémenter `mapsRanking.ts`. Dans `mapsScraper.ts` : garder l'ordre par sous-requête (tableau `{url, subQuery, index}` au lieu du seul `Set`, la première sous-requête qui trouve une URL fixe son rang) ; mémoriser chaque fiche ouverte (`scrapePlace`) comme `MapsCompetitor` ; à la fin, remplir `mapsRank`, `mapsQuery` (`searchLabel`), `mapsCheckedAt` (ISO) et `competitors` (`pickCompetitors` parmi les fiches ouvertes de la même sous-requête) sur chaque lead qualifié. Aucune navigation Maps supplémentaire.
- [ ] **Step 4:** Tests verts, `npm run typecheck` vert.
- [ ] **Step 5:** Commit `feat(maps): conserver rang et concurrents de la recherche`.

### Task 2: Module d'inspection `seo_onpage`

**Files:**
- Create: `lead-engine-cli/src/inspector/modules/seoOnPageModule.ts`
- Modify: `shared/opportunities/types.ts` (`SCAN_MODULE_IDS` + `"seo_onpage"`), `shared/opportunities/workflow.ts` (`DATA_KEYS.seo`, nœud `mod("seo_onpage", "Référencement du site", "Titre, description, H1, données structurées, téléphone.", "search", ["seo"])`), `shared/opportunities/catalog.ts` (libellé du module), `lead-engine-cli/src/inspector/modules/index.ts`, `lead-engine-cli/src/types.ts` (`SiteInspection.seo?: SeoOnPage`)
- Test: `lead-engine-cli/src/tests/seoOnPage.test.ts`

**Interfaces:**
- Produces:
  - `interface SeoOnPage { title: string | null; metaDescription: string | null; h1: string | null; hasLocalBusinessSchema: boolean; phones: string[]; hasTelLink: boolean; activityInTitleOrH1: boolean; cityInTitleOrH1: boolean; phoneMatchesListing: boolean | null }`
  - `analyzeSeoHtml(html: string, ctx: { activity: string; city: string; listingPhone: string | null }): SeoOnPage` (pur ; `phoneMatchesListing` = null si pas de téléphone sur la fiche ou le site ; numéros comparés sur leurs 9 derniers chiffres)

- [ ] **Step 1: Tests** sur HTML fixes : titre « Plombier à Lyon 3 – Dupont » + activité « Plombier » ville « Lyon » → `activityInTitleOrH1` et `cityInTitleOrH1` vrais (insensible casse/accents) ; JSON-LD `"@type":"Plumber"` et `["LocalBusiness"]` → `hasLocalBusinessSchema` vrai ; `<a href="tel:+33478000000">` et fiche `04 78 00 00 00` → `hasTelLink` et `phoneMatchesListing` vrais ; page sans rien → champs null/false, `phoneMatchesListing` null.
- [ ] **Step 2:** Test FAIL.
- [ ] **Step 3:** Implémenter `analyzeSeoHtml` et le module (`afterNavigate` : `page.content()` → `result.seo`). `registry.test.ts` et `schemaSync`/`typecheck` doivent rester verts (le `Record<ScanModuleId, …>` impose l'enregistrement).
- [ ] **Step 4:** `npm run typecheck && npm test` vert.
- [ ] **Step 5:** Commit `feat(inspection): module de référencement du site`.

### Task 3: Pixels des concurrents

**Files:**
- Modify: `lead-engine-cli/src/inspector/modules/adsPixelSpyModule.ts` (extraire la détection)
- Create: `lead-engine-cli/src/collector/competitorPixels.ts`
- Test: `lead-engine-cli/src/tests/competitorPixels.test.ts`

**Interfaces:**
- Consumes: `MapsCompetitor` (Task 1).
- Produces:
  - `detectPaidAdsInHtml(html: string): string[]` (exportée par `adsPixelSpyModule.ts`, mêmes libellés qu'aujourd'hui ; le module l'utilise)
  - `interface CompetitorPixels { name: string; rank: number; website: string; pixels: string[] | null }` (`null` = non vérifié)
  - `fetchCompetitorPixels(competitors: MapsCompetitor[], fetcher: typeof fetch = fetch, timeoutMs = 5000): Promise<CompetitorPixels[]>` — seulement ceux qui ont un site, en parallèle.

- [ ] **Step 1: Tests** avec faux `fetcher` : HTML contenant `fbq('init'` → `["Meta Ads (Facebook Pixel)"]` ; réponse 500 → `pixels: null` ; délai dépassé → `null` ; concurrent sans site → absent du résultat.
- [ ] **Step 2:** FAIL. **Step 3:** Implémenter. **Step 4:** vert, et les tests existants d'`ads_pixel_spy` inchangés.
- [ ] **Step 5:** Commit `feat(acquisition): pixels publicitaires des concurrents`.

### Task 4: Calcul des scores

**Files:**
- Create: `lead-engine-cli/src/generator/reportScoring.ts`
- Test: `lead-engine-cli/src/tests/reportScoring.test.ts`

**Interfaces:**
- Consumes: `MapsLead` (Task 1), `SeoOnPage` (Task 2), `CompetitorPixels` (Task 3), `SiteInspection`.
- Produces:
  - `interface ScoreCriterion { id: string; label: string; max: number; earned: number | null }` (`earned: null` = non mesuré)
  - `interface ScoreResult { score: number; criteria: ScoreCriterion[]; removed: ScoreCriterion[] }` — `score = round(100 × Σearned / Σmax des critères mesurés)`, 0 si aucun.
  - `visibilityScore(lead: MapsLead, inspection: SiteInspection | null): ScoreResult` — groupes position 35, avis 30, fiche 10, site 25 (le découpage interne de chaque groupe est libre ; « site relié » appartient à la fiche).
  - `acquisitionScore(inspection: SiteInspection | null, competitors: CompetitorPixels[]): ScoreResult` — suivi et pixels 40, page d'arrivée 40, comparaison 20.
  - `scoreActions(result: ScoreResult, max = 3): string[]` — libellés d'action des critères ayant perdu le plus de points, sans chiffre promis.

- [ ] **Step 1: Tests** : sans site → groupe site 0/25, « site relié » dans `removed`, `score ≤ 75` même avec rang 1 et avis parfaits ; sans `mapsRank` (scan par domaines) → critères de position dans `removed`, score ramené sur 100 ; concurrents tous `pixels: null` → comparaison retirée ; tout mesuré parfait → 100.
- [ ] **Step 2:** FAIL. **Step 3:** Implémenter. **Step 4:** vert.
- [ ] **Step 5:** Commit `feat(bilans): calcul des scores visibilité et acquisition`.

### Task 5: Mise en page commune et générateurs de bilans

**Files:**
- Create: `lead-engine-cli/src/generator/reportLayout.ts`, `lead-engine-cli/src/generator/visibilityReportGenerator.ts`, `lead-engine-cli/src/generator/acquisitionReportGenerator.ts`
- Modify: `lead-engine-cli/src/generator/trackerReportGenerator.ts` (utilise `reportLayout.ts`, rendu inchangé pour le prospect)
- Test: `lead-engine-cli/src/tests/reports.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces:
  - `renderReportPage(p: { title: string; leadId: string; remoteAppUrl: string; header: string; sections: string[] }): string` (document complet, pixel `/api/tracker/open?leadId=` inclus comme aujourd'hui)
  - `renderScoreBadge(r: ScoreResult): string` — score visible, détail (critères `earned/max`, critères retirés) en infobulle au survol (`group-hover`) et ouvert/fermé au toucher (attribut `data-score-toggle`, petit script inline)
  - `generateVisibilityReportHtml(i: { leadId: string; lead: MapsLead; inspection: SiteInspection | null; remoteAppUrl: string; siteDemoUrl: string | null }): string`
  - `generateAcquisitionReportHtml(i: { leadId: string; lead: MapsLead; inspection: SiteInspection | null; competitorPixels: CompetitorPixels[]; remoteAppUrl: string; siteDemoUrl: string | null }): string`
  - `buildReportAudit(r: ScoreResult, summary: string): SiteAudit` (weaknesses = `scoreActions`)

- [ ] **Step 1: Tests** : sections présentes dans l'ordre de la spec (§4.2, §4.3) ; recherche et date affichées ; lead rang 1 → message « en tête » et suivants listés ; sans `mapsRank` → pas de section position ; `siteDemoUrl` fourni → lien « Voir à quoi pourrait ressembler votre site », absent sinon ; concurrent nommé `Dupont <b>&"` → échappé dans le HTML et l'infobulle ; aucun lien bibliothèque Meta dans le bilan ; test existant du rapport RGPD toujours vert.
- [ ] **Step 2:** FAIL. **Step 3:** Implémenter (Tailwind v3 par CDN, esprit du rapport RGPD ; `tailwindV3.test.ts` ne couvre pas ce dossier : rester en v3). **Step 4:** vert.
- [ ] **Step 5:** Ouvrir les deux bilans générés depuis des données fixes (fichier HTML local) en 1400 px et 390 px, vérifier l'infobulle au survol et au toucher, capture à l'appui.
- [ ] **Step 6:** Commit `feat(bilans): générateurs des bilans visibilité et acquisition`.

### Task 6: Preuves, définitions et démo complémentaire dans le workflow

**Files:**
- Modify: `shared/opportunities/types.ts` (`PROOF_GENERATOR_IDS` + `"visibility_report"`, `"acquisition_report"` ; `ProofDefinition` + `{kind:"visibility_report"; generator:"visibility_report"; interestCta}` et `{kind:"acquisition_report"; generator:"acquisition_report"; interestCta}` ; `OpportunityDefinition.complementDemo?: "auto" | "always" | "never"`), `shared/opportunities/validate.ts`, `shared/opportunities/catalog.ts`, `shared/opportunities/workflow.ts` (nœuds `visibility_report`, `acquisition_report` écrivant `["preuve","rapport"]` ; nœud `site_demo` stage `produce`, reads `["preuve"]`, writes `["demo_site"]` + `DATA_KEYS.demo_site` ; `workflowNodeIds` ajoute `site_demo` après la preuve pour ces deux kinds), `shared/opportunities/definitions/seoLocal.ts`, `adsAcquisition.ts` (nouvelles preuves, `seo_onpage`, `complementDemo: "auto"`, `status: "draft"`), `lead-engine-cli/src/opportunities/generators.ts`, `lead-engine-cli/src/workflow/runner.ts` (`Dossier.siteDemoHtml`, cas `site_demo`, `buildSyncPayload`), `lead-engine-cli/src/types.ts` (`SyncPayload.site_demo_html?`)
- Create: `lead-engine-cli/src/opportunities/siteDemo.ts`
- Test: `lead-engine-cli/src/tests/siteDemo.test.ts`, `shared/opportunities/workflow.test.ts`, `shared/opportunities/validate.test.ts`

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces:
  - `needsSiteDemo(def: OpportunityDefinition, lead: MapsLead, inspection: SiteInspection | null): boolean` (règles des Global Constraints ; `always` → vrai, `never` → faux)
  - Les générateurs `visibility_report` / `acquisition_report` dans `PROOF_GENERATORS` (le second appelle `fetchCompetitorPixels`, stocké dans `inspection`/audit pour la sync) ; le nœud `site_demo` appelle `PROOF_GENERATORS.llm_demo` avec le `focus` de l'offre et remplit `d.siteDemoHtml` ; en prep → `{skipped: "écrite par la file locale"}` ; condition fausse → `{skipped: "site non en cause"}`.
  - Le bilan est produit avant la démo : le générateur de bilan calcule lui-même `needsSiteDemo` et passe
    `siteDemoUrl = ${remoteAppUrl}/demos/${leadId}/site` si vrai (null sinon). Si la génération de la démo échoue
    ensuite, le nœud `site_demo` lève l'erreur comme une autre preuve (le lead n'est pas synchronisé à moitié).
  - `audit_data` synchronisé gagne `maps_rank`, `maps_query`, `maps_checked_at`, `competitors`, `seo`, `competitor_pixels`.

- [ ] **Step 1: Tests** : `needsSiteDemo` pour chaque règle et `always`/`never` ; prospect sans site en `seo_local` → vrai ; `workflowNodeIds(seoLocal)` contient `visibility_report` puis `site_demo` ; `checkWorkflow` accepte les deux définitions ; `validateOpportunityDefinition` refuse `{kind:"visibility_report", generator:"llm_demo"}` ; `registry.test.ts` vert.
- [ ] **Step 2:** FAIL. **Step 3:** Implémenter. **Step 4:** `npm run typecheck && npm test` vert.
- [ ] **Step 5:** Commit `feat(besoins): bilans comme preuve et démo de site conditionnelle`.

### Task 7: Stockage et diffusion de la démo complémentaire

**Files:**
- Modify: `lead-dashboard-web/schema.sql` (`leads.site_demo_html TEXT`), `lead-dashboard-web/src/auth.ts` (`ALTER TABLE leads ADD COLUMN site_demo_html TEXT`, `AUTH_SCHEMA_VERSION` 15 → 16), `lead-dashboard-web/src/routes/public.ts` (`/api/sync` : `site_demo_html` avec `COALESCE` comme `demo_html` ; nouvelle route `GET /demos/:id/site`), `lead-dashboard-web/src/types.ts` si le payload y est typé
- Create: `lead-dashboard-web/migrations/0011_leads_site_demo.sql`
- Test: `lead-dashboard-web/src/tests/` (fichier de la route existant ou nouveau `siteDemo.test.ts`)

**Interfaces:**
- Consumes: `SyncPayload.site_demo_html` (Task 6).
- Produces: `GET /demos/:id/site` — mêmes règles que `/demos/:id` (révoquée/expirée → 410, absente → 404, réécriture des photos R2, suivi d'ouverture, barre d'intérêt, aperçu muet pour un utilisateur connecté). Factoriser le rendu commun en une fonction appelée par les deux routes.

- [ ] **Step 1: Tests** : `/demos/:id/site` sans démo → 404 ; avec démo → 200, pixel injecté ; démo révoquée → 410 ; `schemaSync.test.ts` vert (colonne dans les trois endroits).
- [ ] **Step 2:** FAIL. **Step 3:** Implémenter. **Step 4:** `npm --prefix lead-dashboard-web test` vert.
- [ ] **Step 5:** Commit `feat(demos): démo de site complémentaire servie sur /demos/:id/site`.

### Task 8: Mode préparation, file locale et synchronisation

**Files:**
- Modify: `lead-engine-cli/src/prepScan.ts` (pour ces deux preuves : écrire le bilan en `demo.html` et, si `needsSiteDemo`, `prompt_site_demo.md` ; le `prompt_demo.md` n'est plus produit pour elles), `lead-engine-cli/src/syncQueue.ts` (lire `site_demo.html` ; un dossier avec `prompt_site_demo.md` sans `site_demo.html` reste en attente), `docs/agents/file-de-generation.md` (nouveau fichier à écrire par l'agent)
- Test: `lead-engine-cli/src/tests/syncQueue.test.ts`

**Interfaces:**
- Consumes: `generateVisibilityReportHtml`, `generateAcquisitionReportHtml`, `needsSiteDemo`.

- [ ] **Step 1: Tests** : dossier bilan complet sans démo requise → synchronisable ; avec `prompt_site_demo.md` et sans `site_demo.html` → en attente avec la raison ; avec les deux → payload contient `site_demo_html`.
- [ ] **Step 2:** FAIL. **Step 3:** Implémenter. **Step 4:** vert.
- [ ] **Step 5:** Commit `feat(file): bilans et démo complémentaire en mode préparation`.

### Task 9: Bascule en production, fiche du closer et onglet Besoins

**Files:**
- Modify: `lead-dashboard-web/src/services/opportunityStore.ts` (bascule au chargement), `lead-dashboard-web/src/views/closer.ts` (bloc bilan : rang, concurrents ; lien bibliothèque Meta pour `ads_acquisition`), `lead-dashboard-web/public/static/besoins.js` (choix `complementDemo` par boutons : Automatique / Toujours / Jamais ; libellés des nouvelles preuves), `lead-dashboard-web/src/types.ts` (`proofType` des nouveaux kinds), `lead-dashboard-web/src/views/needs.ts`
- Test: `lead-dashboard-web/src/tests/opportunityStore.test.ts` (créer si absent, faux D1 minimal)

**Interfaces:**
- Produces: `migrateReportProofs(db: D1Database): Promise<number>` — pour `seo_local` et `ads_acquisition`, si la ligne stockée a `proof.kind === "demo_web"`, la remplace par la définition du code via le chemin d'enregistrement existant (nouvelle version, entrée d'historique, `updated_by = "code-migration"`), même si Loïc l'avait modifiée (décision du 13/11/2026). Idempotente : renvoie 0 au second appel. Appelée une fois par isolat avant la première lecture des définitions.
- Lien Meta : `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=FR&q=<nom encodé>`.

- [ ] **Step 1: Tests** : ligne `demo_web` → remplacée, historique +1, second appel → 0 ; ligne déjà en `visibility_report` → intacte.
- [ ] **Step 2:** FAIL. **Step 3:** Implémenter. **Step 4:** `npm run typecheck && npm test` vert ; onglet Besoins et fiche closer vérifiés à l'écran en local (bureau et mobile, console sans erreur).
- [ ] **Step 5:** Commit `feat(besoins): bascule des bilans en production et affichage closer`.

### Task 10: Scans de test et documentation

**Files:**
- Modify: `docs/agents/besoins.md`, `docs/ARCHITECTURE.md` (§6 types d'opportunité), `A_FAIRE.md` (case des générateurs), `AGENTS.md` si une règle change

- [ ] **Step 1:** Sauvegarder la base de production (`docs/agents/donnees-d1.md`) avant la fusion de la PR (la bascule s'exécute au déploiement).
- [ ] **Step 2:** Scan de test réel par besoin, sans synchroniser : `npm run scan -- --query "plombier" --city "Lyon" --limit 1 --opportunity seo_local --dry-run`, idem `ads_acquisition` avec un prospect qui a un site ; relire `output/<id>/demo.html` (bilan) et la démo complémentaire si produite ; captures bureau et mobile.
- [ ] **Step 3:** Mettre à jour la doc ; commit `docs(bilans): besoins, architecture, à faire`.
- [ ] **Step 4:** PR vers `main` avec les captures ; après fusion, redémarrer le worker de production. L'activation des deux besoins reste à Loïc après relecture.
