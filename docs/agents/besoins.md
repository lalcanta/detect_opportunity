# Besoins (offres) : définitions, workflow, ajout

À lire avant d'ajouter ou de modifier un besoin (`shared/opportunities/`, onglet Besoins du CRM).

## Où vit une définition

- **La base fait foi** : table D1 `opportunity_definitions`, versionnée (historique dans
  `opportunity_definition_history`), éditée dans l'onglet Besoins (`POST /api/admin/opportunities`, validée par
  `validateOpportunityDefinition`). Le worker la récupère du CRM (`lead-engine-cli/src/opportunities/remote.ts`).
- **Le code ne fait qu'amorcer** : `CODE_OPPORTUNITIES` (`shared/opportunities/index.ts`) est inséré en
  `INSERT OR IGNORE` au premier accès (`seedIfEmpty`, `lead-dashboard-web/src/services/opportunityStore.ts`).
  Modifier un fichier `definitions/*.ts` d'un besoin déjà en base ne change rien en production : faire la
  modification dans l'onglet Besoins, ou dans les deux si la valeur initiale doit suivre.
- **Exception unique, la bascule des bilans** (décision du 13/11/2026, « écrase au besoin ») : `migrateReportProofs`
  (même fichier), lancée avant la première lecture des définitions, remplace les lignes `seo_local` et
  `ads_acquisition` encore en démo de site (`proof.kind === "demo_web"`) par la définition du code, même modifiées
  dans l'onglet. Elle ne passe qu'une fois au total : l'entrée `changed_by = "code-migration"` qu'elle laisse dans
  l'historique la marque comme faite. Un retour à la démo de site fait ensuite depuis l'onglet Besoins (historique,
  « Reprendre cette version ») est donc conservé.

## Ajouter un besoin

**Sans code**, quand il combine des briques existantes (modules d'inspection, générateurs de preuve et de message,
canaux) : le créer dans l'onglet Besoins, en brouillon.

**Avec code**, quand il lui faut une brique nouvelle :

1. Nouveau module d'inspection : identifiant dans `SCAN_MODULE_IDS` (`shared/opportunities/types.ts`), implémentation
   dans `lead-engine-cli/src/inspector/modules/` (modèle : `socialLinksModule.ts`), enregistrée dans
   `SCAN_MODULES_REGISTRY` (`modules/index.ts`).
2. Nouveau générateur : identifiant dans `PROOF_GENERATOR_IDS` ou `PITCH_GENERATOR_IDS`, implémentation dans
   `PROOF_GENERATORS` / `PITCH_GENERATORS` (`lead-engine-cli/src/opportunities/generators.ts`). Les `Record<…Id, …>`
   font échouer `npm run typecheck` tant qu'une brique déclarée n'est pas implémentée.
3. Définition initiale : `shared/opportunities/definitions/<nom>.ts` en `status: "draft"` (modèle : `seoLocal.ts`),
   ajoutée à `CODE_OPPORTUNITIES`.
4. `npm test` : le test du registre (`shared/opportunities/registry.test.ts`) doit passer.
5. Scan de test sur le brouillon : `npm run scan -- --query "…" --city "…" --limit 1 --opportunity <id> --dry-run`.
6. Passer le besoin en actif dans l'onglet Besoins, une fois la démo du scan de test relue.

## Workflow d'un besoin

Les nœuds déclarent les clés qu'ils lisent et écrivent (`shared/opportunities/workflow.ts`) ; l'ordre et les vagues
parallèles s'en déduisent (`workflowWaves`), le worker les exécute (`lead-engine-cli/src/workflow/runner.ts`).
Un nouveau nœud déclare ses prérequis : ne jamais coder un ordre à la main.

Les preuves « bilan » (`visibility_report`, `acquisition_report`) sont suivies du nœud `site_demo` : une démo de site
(générateur `llm_demo`, angle du bilan) jointe au bilan selon `complementDemo` (`auto` par défaut, `always`, `never`).
Dans l'onglet Besoins, le choix se fait sur la carte « Démo de site complémentaire » du graphe (Automatique /
Toujours / Jamais) ; `public/static/besoins.js` recopie l'ordre de `workflowNodeIds` (`nodeIdsOf`), à tenir identique.
Les règles de `auto` sont dans `lead-engine-cli/src/opportunities/siteDemo.ts` (`needsSiteDemo`) ; le bilan, produit
avant, cite `/demos/:id/site` quand la démo sera produite.

Types de preuve (`proof.kind`) : `demo_web` (démo de site), `visibility_report` (bilan de visibilité locale : position
Maps, concurrents listés, avis, SEO de la page, score sur 100), `acquisition_report` (bilan d'acquisition : pixels,
consentement, page d'arrivée, concurrents, score sur 100), `audit_report` (rapport traceurs). Les bilans ne citent que des données
publiques relevées à la date du constat (recherche Maps rejouée telle quelle, aucun chiffre inventé) ; le score
détaille ses points dans un « détail du score ». Un prospect sans fiche Maps (scan par liste de domaines :
`MapsLead.noMapsListing`, `audit_data.no_maps_listing`) n'a ni note, ni avis, ni fiche, ni métier et ville connus : ces
critères (et « métier et ville dans le titre ») sont non mesurés, retirés du score, et ne déclenchent pas la démo.

Décisions métier sur les besoins (prérequis, canaux, emails) : `docs/PLAN_REFONTE_LEADS.md` §6 (10/11/2026).
