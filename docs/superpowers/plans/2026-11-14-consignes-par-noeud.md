# Consignes de texte assemblées par nœud — plan de réalisation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une seule fonction construit la consigne des textes rédigés par l'IA (script d'appel, message écrit), à partir des seuls constats des nœuds qui ont réellement mesuré quelque chose, à l'identique en mode préparation et en mode complet.

**Architecture:** `lead-engine-cli/src/workflow/pitchFacts.ts` déclare, par nœud du catalogue, sa contribution (`PitchFact[]` ou `null`) et l'angle de chaque preuve ; `workflow/pitchPrompt.ts` assemble rôle, offre, constats, règles et schéma. Le runner (mode complet) et `prepScan.ts` (mode préparation) construisent la même entrée `PitchInput` et appellent la même fonction.

**Tech Stack:** Node 22, TypeScript lancé par `tsx`, tests `node:test` (`tsx --test`), zod.

**Spec:** `docs/superpowers/specs/2026-11-14-consignes-par-noeud-design.md`

## Global Constraints

- Français partout : code commenté, constats, consignes, messages de commit `type(portée): description`.
- Commits terminés par :
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` puis `Claude-Session: https://claude.ai/code/session_01GTrYzuJ8DrjL5DZzRppp3N`.
- Ne jamais lire ni afficher `.env`, `.dev.vars` (liens symboliques dans le worktree). Supprimer avec `trash`, jamais `rm -rf`.
- Aucune valeur par défaut présentée comme une mesure : une mesure absente n'apparaît pas dans la consigne (jamais « 0 avis », « 5★ », « n/a »).
- Aucun exemple chiffré, nommé ou cité dans les descriptions du schéma JSON.
- Le message de l'audit RGPD (`tracker_cold_email`) et la consigne de la démo (`prompt_demo.md`) ne changent pas.
- Ne pas toucher `queue/completed/`, ni les `meta.json` / `audit_facts.json` existants.
- Vérification de chaque tâche : `npm run typecheck && npm test` à la racine du worktree.

## Review Focus

- Prospect sans fiche Maps (`noMapsListing`, scan par domaines) : aucune note, aucun avis, aucun rang ni concurrent dans la consigne.
- Lead sans note lue (`rating: null`, `reviewsCount: null`) : aucune note ; lead noté 5 réellement : « 5/5 » présent.
- Inspection en échec (`inspection: null` alors que les modules sont `done` dans la trace) : les contributions des modules renvoient `null`, aucun constat de site.
- Bilan de visibilité avec `mapsRank: 1` : l'angle ne parle ni de manque de visibilité ni d'appels ; rang absent : aucune position citée.
- Pixel concurrent `pixels: null` : écrit « non vérifié », jamais « aucun pixel ».

---

### Task 1: Détection Google Ads et libellé du consentement

**Files:**
- Modify: `lead-engine-cli/src/inspector/modules/adsPixelSpyModule.ts`
- Modify: `lead-engine-cli/src/inspector/modules/trackersModule.ts:61`
- Modify: `lead-engine-cli/src/generator/acquisitionReportGenerator.ts:43`
- Modify: `lead-engine-cli/src/generator/reportScoring.ts:109` (commentaire)
- Test: `lead-engine-cli/src/tests/reportScoring.test.ts`, `lead-engine-cli/src/tests/reports.test.ts`

**Interfaces:**
- Produces: `detectPaidAdsInHtml` et `detectPaidAdsFromHtml` reconnaissent Google Ads aussi par les formes ci-dessous ; `CONSENT_GATED_LABEL` exporté de `reportScoring.ts`, utilisé par le bilan d'acquisition et par la Task 2.

- [ ] **Step 1: Tests qui échouent**

Dans `reportScoring.test.ts` (ou un nouveau `adsPixelSpy.test.ts`) :
- `detectPaidAdsInHtml('<script>var google_conversion_id = 987654321;</script>')` contient `"Google Ads (Conversion AW-)"` ;
- `detectPaidAdsInHtml('<script src="https://www.googleadservices.com/pagead/conversion.js"></script>')` le contient ;
- `detectPaidAdsFromHtml("", [], ["https://googleads.g.doubleclick.net/pagead/viewthroughconversion/987654321/?x=1"])` le contient ;
- `detectPaidAdsFromHtml("", [], ["https://www.googleadservices.com/pagead/conversion/987654321/"])` le contient ;
- `detectPaidAdsInHtml('<script src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"></script>')` ne le contient pas (AdSense) ;
- `detectPaidAdsFromHtml("", [], ["https://ad.doubleclick.net/ddm/activity/src=1"])` ne le contient pas (Floodlight).

Dans `reports.test.ts` : un bilan d'acquisition avec bandeau (`cmpDetected: "Axeptio"`) et `htmlTagIds.googleAds: ["AW-123456789"]` sans pixel réseau contient `présent dans la page (déclenché par le bandeau cookies, non vérifié)` et ne contient plus `déclenché après consentement`.

- [ ] **Step 2: Lancer, vérifier l'échec** — `npm test` : ces cas échouent.

- [ ] **Step 3: Implémenter**

- `adsPixelSpyModule.ts` : Google Ads reconnu par `AW-\d{6,12}`, `google_conversion_id\s*=\s*\d{6,12}`, `googleadservices\.com\/pagead\/conversion`, et, dans les URL de requêtes, `googleadservices\.com\/pagead\/conversion\/\d+` ou `googleads\.g\.doubleclick\.net\/pagead\/viewthroughconversion\/\d+`. AdSense et `ad.doubleclick.net` restent exclus. Mettre à jour le commentaire.
- `trackersModule.ts:61` : `googleAds` ajoute aussi les numéros de `google_conversion_id` sous la forme `AW-<numéro>`.
- `reportScoring.ts` : `export const CONSENT_GATED_LABEL = "présent dans la page (déclenché par le bandeau cookies, non vérifié)";` et commentaire de `afterConsent` corrigé.
- `acquisitionReportGenerator.ts:43` : `${t} — ${CONSENT_GATED_LABEL}`.

- [ ] **Step 4: Lancer** — `npm run typecheck && npm test` : tout passe.

- [ ] **Step 5: Commit** — `fix(acquisition): conversions Google Ads sans AW- reconnues, libellé du consentement`

---

### Task 2: Contributions des nœuds

**Files:**
- Create: `lead-engine-cli/src/workflow/pitchFacts.ts`
- Test: `lead-engine-cli/src/tests/pitchFacts.test.ts`

**Interfaces:**
- Consumes: `NodeRun`, `SireneInfo` (types de `workflow/runner.ts`, import `type` seulement) ; `WORKFLOW_NODES` (`shared/opportunities`) ; `trackingView`, `CONSENT_GATED_LABEL` (`generator/reportScoring.ts`) ; `needsSiteDemo` (`opportunities/siteDemo.ts`).
- Produces :

```ts
export interface PitchFact { label: string; value: string }

/** Entrée commune aux deux modes. */
export interface PitchInput {
  def: OpportunityDefinition;
  lead: MapsLead;
  /** Lien principal `/demos/:id` (démo de site ou bilan). */
  demoUrl: string;
  primaryChannel: ChannelId;
  inspection: SiteInspection | null;
  sirene: SireneInfo | null;
  trace: NodeRun[];
  /** Bilan seulement : score et actions prioritaires (calcul déterministe, identique dans les deux modes). */
  report: { score: number; actions: string[] } | null;
  competitorPixels: CompetitorPixels[] | null;
  /** Démo de site complémentaire d'un bilan, null si elle n'est pas produite. */
  siteDemoUrl: string | null;
}

/** Constats, dans l'ordre de `WORKFLOW_NODES` ; la fiche Maps d'abord. */
export function pitchFacts(p: PitchInput): PitchFact[];

/** Angle de la preuve du besoin : comment présenter le lien principal. Une ou deux phrases. */
export function proofAngle(p: PitchInput): string;
```

- [ ] **Step 1: Tests qui échouent** (`pitchFacts.test.ts`, une fixture `PitchInput` construite par une fonction `input(over)`)

- fiche : lead noté `4.6` avec `61` avis → un fait dont la valeur contient `4.6/5` et `61 avis` ; lead `rating: null, reviewsCount: null` → aucun fait ne contient `avis` ni `/5` ; `noMapsListing: true` → aucun fait de note, d'avis, de rang ni de concurrent ;
- avis : `recentReviews` avec un texte → un fait contient l'extrait et l'auteur ; `recentReviews: []` → aucun fait « Avis » ;
- `seo_onpage` `done` avec `seo.title: "Accueil"`, `activityInTitleOrH1: false` → un fait cite `Accueil` et dit que le métier est absent ; même inspection mais `seo_onpage` `skipped` dans la trace → aucun fait de titre ;
- inspection `null` avec tous les modules `done` → aucun fait de site (seuls ceux de la fiche) ;
- `ads_pixel_spy` `done`, `cmpDetected` et `htmlTagIds.googleAds: ["AW-1"]` sans `paidAdsDetected` → la valeur contient `CONSENT_GATED_LABEL` ;
- concurrents (bilan d'acquisition) : `competitorPixels: [{ pixels: null, … }]` → valeur `non vérifié`, et aucune valeur ne contient `aucun pixel` pour ce concurrent ;
- ordre : un fait de `seo_onpage` précède un fait de `ads_pixel_spy` (ordre de `WORKFLOW_NODES`) ;
- `proofAngle` : bilan de visibilité `mapsRank: 1` → ne contient ni `manque de visibilité` ni `appels` ; `mapsRank: 4` → parle des concurrents placés devant ; `mapsRank` absent → ne contient pas `position` ; démo de site → parle de la maquette préparée ;
- démo complémentaire : `siteDemoUrl` non null → un fait contient l'URL ; null pour un bilan → `proofAngle` interdit de proposer un nouveau site.

- [ ] **Step 2: Lancer, vérifier l'échec.**

- [ ] **Step 3: Implémenter `pitchFacts.ts`**

Une table `CONTRIBUTIONS: Partial<Record<string, (p: PitchInput) => PitchFact[] | null>>` indexée par id de nœud. Règles :
- `pitchFacts` appelle la contribution d'un nœud seulement si la trace contient ce nœud en `done` ; les contributions de la fiche Maps (nom, métier, ville, note, avis, rang et concurrents si mesurés, recherche et date) et de la preuve/démo complémentaire ne dépendent pas de la trace (spec, « Précisions »).
- Un module dont le champ n'est pas renseigné (`inspection` null ou champ `undefined`) renvoie `null`.
- Contributions : `seo_onpage`, `contacts_legal`, `dirigeant_sirene` (via `sirene` et `inspection.keyPeople`), `perf_mobile`, `freshness_ssl`, `tech_stack`, `ads_pixel_spy` (via `trackingView`), `social_links`, `contact_form` (présence seulement). Pour le bilan : score et actions de `report`, pixels des concurrents de `competitorPixels`.
- Avis cités : au plus 2, extrait de 200 caractères au plus, avec l'auteur.
- `proofAngle` selon `def.proof.kind` : `demo_web`, `visibility_report` (selon `mapsRank`, spec « Rang »), `acquisition_report`. Pour `audit_report`, renvoyer la chaîne vide (hors périmètre).

- [ ] **Step 4: Lancer** — `npm run typecheck && npm test` : tout passe.

- [ ] **Step 5: Commit** — `feat(pitch): constats apportés par chaque nœud du workflow`

---

### Task 3: Assembleur de consigne

**Files:**
- Create: `lead-engine-cli/src/workflow/pitchPrompt.ts`
- Test: `lead-engine-cli/src/tests/pitchPrompt.test.ts`

**Interfaces:**
- Consumes: `PitchInput`, `pitchFacts`, `proofAngle` (Task 2) ; `messageToneInstruction` (`shared/opportunities`).
- Produces :

```ts
export type LlmPitchGenerator = "llm_phone_battlecard" | "llm_cold_email";
/** Consigne complète, identique en mode préparation et en mode complet. */
export function buildPitchPrompt(p: PitchInput, generator: LlmPitchGenerator): string;
```

- [ ] **Step 1: Tests qui échouent**

- contient le titre `Constats mesurés (les seuls que tu peux citer)` puis une ligne `- <label> : <value>` par fait de `pitchFacts(p)` ;
- contient `proofAngle(p)`, `def.label`, `def.commercial.pitchFocus` et `messageToneInstruction(def.commercial.tone)` quand le ton est défini ;
- `llm_phone_battlecard` : le schéma demande `callScript`, `objections`, `whatsappText`, `coldEmail` ; `llm_cold_email` : il demande `coldEmail` et pas `callScript` ;
- canal `contact_form` : contient `900 caractères` ; message écrit : contient la ligne `Pour ne plus recevoir de message de notre part, répondez simplement STOP.` ;
- lead sans note : la consigne ne contient ni `5★` ni `0 avis` ni `n/a` ; lead noté `5` avec `12` avis : elle contient `5/5` ;
- le schéma ne contient aucun chiffre ni le nom du lead dans les descriptions de champ (vérifier qu'aucun chiffre n'apparaît entre la ligne de début du bloc JSON et sa fin, hors limites de longueur rédigées en dehors du bloc) ;
- appel deux fois avec la même entrée : chaîne identique.

- [ ] **Step 2: Lancer, vérifier l'échec.**

- [ ] **Step 3: Implémenter** l'ordre de la spec (« Assemblage ») : rôle, offre, constats, règles communes (n'utiliser que les constats, aucun chiffre absent — ni appels, ni chiffre d'affaires, ni trafic —, vouvoiement, limites de longueur actuelles de `copywriter/battlecard.ts:73`), schéma de `battlecardSchema` selon le générateur, en JSON strict.

- [ ] **Step 4: Lancer** — `npm run typecheck && npm test` : tout passe.

- [ ] **Step 5: Commit** — `feat(pitch): consigne de texte assemblée depuis les constats`

---

### Task 4: Mode complet sur l'assembleur

**Files:**
- Modify: `lead-engine-cli/src/opportunities/generators.ts` (`PITCH_GENERATORS`, `PitchGenerator`, `bilanPitchFor` supprimé)
- Modify: `lead-engine-cli/src/workflow/runner.ts` (cas `pitch` de `runNode`)
- Modify: `lead-engine-cli/src/copywriter/battlecard.ts`, `lead-engine-cli/src/copywriter/coldEmail.ts`
- Delete: `lead-engine-cli/src/copywriter/bilanPitch.ts` si plus rien ne l'utilise (garder `bilanLabel` ailleurs si besoin) ; adapter `tests/bilanPitch.test.ts`
- Test: `lead-engine-cli/src/tests/workflowRunner.test.ts`

**Interfaces:**
- Consumes: `buildPitchPrompt`, `PitchInput` (Tasks 2-3) ; `siteDemoUrl` (`opportunities/siteDemo.ts`).
- Produces :
  - `export function pitchInputFromDossier(d: Dossier, remoteAppUrl: string): PitchInput` dans `runner.ts` : `report` = `{ score: d.audit.score, actions: d.audit.weaknesses }` si la preuve est un bilan, sinon null ; `siteDemoUrl` = `siteDemoUrl(def, lead, inspection, remoteAppUrl, leadId)` pour un bilan, sinon null.
  - `PitchGenerator = (ctx: GenerationContext, input: PitchInput, audit: SiteAudit) => Promise<Battlecard>`.
  - `generateBattlecard(router, prompt, lead, demoUrl, usageSink)` et `generateColdEmailPitch(router, prompt, lead, demoUrl, usageSink, def, channel)` : reçoivent la consigne, gardent l'appel au modèle, la validation `battlecardSchema` et leurs secours sans IA (qui ne citent aucune mesure).

- [ ] **Step 1: Test qui échoue** (`workflowRunner.test.ts`) : en mode complet avec un routeur factice qui enregistre la consigne reçue, pour un besoin bilan de visibilité avec `mapsRank: 1` et un lead sans note, la consigne reçue est égale à `buildPitchPrompt(pitchInputFromDossier(d, url), "llm_phone_battlecard")` et ne contient ni `manque de visibilité` ni `5★`.

- [ ] **Step 2: Lancer, vérifier l'échec.**

- [ ] **Step 3: Implémenter** ; `tracker_cold_email` garde son comportement (il ignore `input`). Supprimer les consignes en dur des deux générateurs et `bilanPromptFacts`.

- [ ] **Step 4: Lancer** — `npm run typecheck && npm test` : tout passe.

- [ ] **Step 5: Commit** — `refactor(pitch): le mode complet rédige depuis la consigne assemblée`

---

### Task 5: Mode préparation sur l'assembleur, et doc

**Files:**
- Modify: `lead-engine-cli/src/prepScan.ts` (branches `llm_cold_email` et battlecard d'appel ; suppression de `battlecardSalesAngle`, `buildWrittenPitchPrompt`)
- Modify: `lead-engine-cli/src/queueReports.ts` (suppression de `bilanBattlecardRules`) ; `lead-engine-cli/src/tests/queueReports.test.ts`
- Modify: `docs/agents/file-de-generation.md`, `lead-engine-cli/AGENTS.md` si elles décrivent ces consignes ; skill `.claude/skills/leadengine/SKILL.md` seulement s'il cite un champ disparu
- Test: nouveau test dans `lead-engine-cli/src/tests/queueReports.test.ts` ou `pitchPrompt.test.ts`

**Interfaces:**
- Consumes: `pitchInputFromDossier` (Task 4), `buildPitchPrompt` (Task 3), `BilanQueueFiles` (`queueReports.ts`).
- Produces : `export function prepPitchInput(dossier: Dossier, bilan: BilanQueueFiles | null, remoteAppUrl: string): PitchInput` dans `prepScan.ts` (ou `queueReports.ts`) : comme `pitchInputFromDossier`, mais `report` vient de `bilan.auditFacts` (`score.score`, `weaknesses`) et `competitorPixels` de `bilan.competitorPixels`.

- [ ] **Step 1: Test qui échoue** : pour un même lead, une même trace et un bilan dont score et actions sont ceux de l'audit du mode complet, `buildPitchPrompt(prepPitchInput(...))` est identique à `buildPitchPrompt(pitchInputFromDossier(...))`.

- [ ] **Step 2: Lancer, vérifier l'échec.**

- [ ] **Step 3: Implémenter** : `prompt_battlecard.md` = en-tête `# Consigne de génération du battlecard` + `Enregistre le JSON valide dans : \`<leadDir>/battlecard.json\`` + `buildPitchPrompt(...)`. La branche `tracker_cold_email` reste telle quelle. `syncQueue.ts` garde la lecture des anciens champs (`openingPitch`, `executiveSummary`, `currentSiteCritique`). Mettre à jour la doc qui décrit le contenu de `prompt_battlecard.md`.

- [ ] **Step 4: Lancer** — `npm run typecheck && npm test && npm --prefix lead-dashboard-web test` : tout passe ; `grep -rn "battlecardSalesAngle\|buildWrittenPitchPrompt\|bilanBattlecardRules\|bilanPromptFacts" lead-engine-cli/src` ne renvoie rien.

- [ ] **Step 5: Commit** — `refactor(prep): la file reçoit la consigne assemblée par nœud`

---

### Task 6: Vérification réelle (contrôleur, pas de sous-agent)

- [ ] Contre un CRM local (`npm run dev:web`), un `prep` par besoin : `website_redesign`, `seo_local`, `ads_acquisition` (`--limit 3`, une ville réelle).
- [ ] Lire chaque `prompt_battlecard.md` produit : aucun constat non mesuré, aucun « 5★ », « 0 avis », « manque de visibilité », angle cohérent avec le rang.
- [ ] Ne pas synchroniser vers la production ; vider `queue/pending` des dossiers de test avec `trash`.
- [ ] Soumettre les trois consignes à l'utilisateur.
