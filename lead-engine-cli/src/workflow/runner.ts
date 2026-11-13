/**
 * Exécution du workflow d'un besoin pour un lead : les nœuds du graphe (shared/opportunities/workflow.ts) tournent par
 * vagues, chaque vague en parallèle, et complètent un dossier partagé. Remplace la suite codée en dur
 * inspection → qualification → preuve → flyer → message.
 *
 * La collecte et le filtre Maps se font en amont, pour tout le scan ; la remise au CRM revient à l'appelant (envoi ou
 * écriture locale) et le premier contact au closer. Les modules qui lisent le site partagent une seule ouverture de page ;
 * ceux qui n'en ont pas besoin (SIRENE) tournent à côté, y compris pour un prospect sans site.
 */
import type { BrowserContext } from "playwright";
import {
  CHANNEL_LABELS,
  DATA_KEYS,
  keysBlockedBy,
  pitchGeneratorFor,
  workflowNode,
  workflowNodeIds,
  workflowWaves,
  type ChannelId,
  type DataKey,
  type OpportunityDefinition,
  type QualificationResult,
  type ScanModuleId,
  type WorkflowNodeType,
} from "../../../shared/opportunities";
import { generateFlyerPdf } from "../generator/flyerGenerator";
import { inspectSite, lookupCompanySirene } from "../inspector/siteInspector";
import type { ModelRouter } from "../llm/modelRouter";
import type { CompetitorPixels } from "../collector/competitorPixels";
import { PITCH_GENERATORS, PROOF_GENERATORS, type GenerationContext } from "../opportunities/generators";
import { needsSiteDemo, siteDemoFocus } from "../opportunities/siteDemo";
import { buildLeadContacts, buildUnqualifiedPayload, qualifyAfterInspection, UnqualifiedLeadError } from "../opportunities/qualify";
import { log } from "../utils/helpers";
import type { Battlecard, MapsLead, SiteAudit, SiteInspection, SyncPayload, TokenUsageRecord } from "../types";

/** `full` : tout le workflow (worker). `prep` : sans modèle de langage, la preuve et les messages sont écrits ensuite par la file locale. */
export type WorkflowMode = "full" | "prep";

export interface NodeRun {
  node: string;
  wave: number;
  status: "done" | "skipped";
  ms: number;
  note?: string;
}

export interface SireneInfo {
  siren: string | null;
  keyPeople: string[];
  createdAt: string | null;
}

/** Dossier prospect : augmenté nœud après nœud. */
export interface Dossier {
  def: OpportunityDefinition;
  lead: MapsLead;
  leadId: string;
  demoUrl: string;
  keys: Set<DataKey>;
  inspection: SiteInspection | null;
  sirene: SireneInfo | null;
  qualification: QualificationResult | null;
  primaryChannel: ChannelId | null;
  audit: SiteAudit | null;
  demoHtml: string | null;
  /** Démo de site complémentaire d'un bilan (nœud `site_demo`). */
  siteDemoHtml: string | null;
  /** Pixels des sites concurrents, mesurés par le bilan d'acquisition. */
  competitorPixels: CompetitorPixels[] | null;
  flyerPdf: Buffer | null;
  battlecard: Battlecard | null;
  usage: TokenUsageRecord[];
  trace: NodeRun[];
}

export interface WorkflowEnv {
  mode: WorkflowMode;
  context: BrowserContext;
  remoteAppUrl: string;
  router?: ModelRouter;
  onSubStep?: (subStep: string) => Promise<boolean | void>;
}

/** Nœuds hors du traitement d'un lead. */
const OUTSIDE_LEAD = new Set(["maps_search", "maps_filter", "crm_handoff"]);
const isPageModule = (n: WorkflowNodeType): boolean => n.binding.kind === "module" && n.reads.includes("site");
const label = (k: DataKey): string => DATA_KEYS[k].label;

/** Clés présentes au départ : ce que le filtre Maps a écrit pour ce lead. */
function initialKeys(def: OpportunityDefinition, lead: MapsLead): Set<DataKey> {
  const keys = new Set<DataKey>(["fiche", "prospect"]);
  if (lead.phone) keys.add("telephone");
  if (lead.website) {
    keys.add("site");
    if (def.requirements.website === "required") keys.add("site_garanti");
  }
  for (const k of keysBlockedBy(def.requirements.website)) keys.delete(k);
  return keys;
}

/** Nœuds exécutés pour un lead, par vagues. */
export function leadWorkflowWaves(def: OpportunityDefinition): string[][] {
  return workflowWaves(workflowNodeIds(def), def.requirements.website)
    .map((w) => w.filter((id) => !OUTSIDE_LEAD.has(id) && workflowNode(id)?.stage !== "channel"))
    .filter((w) => w.length > 0);
}

/** Le dirigeant trouvé sur le site et celui de SIRENE, fusionnés dans l'inspection. */
function mergeSirene(d: Dossier): void {
  if (!d.inspection || !d.sirene) return;
  const i = d.inspection;
  if (d.sirene.siren) i.siren = d.sirene.siren;
  if (d.sirene.createdAt) i.companyCreatedAt = d.sirene.createdAt;
  if (d.sirene.keyPeople.length) i.keyPeople = [...new Set([...(i.keyPeople ?? []), ...d.sirene.keyPeople])].slice(0, 3);
}

function genContext(d: Dossier, env: WorkflowEnv): GenerationContext {
  if (!env.router) throw new Error("modèle de langage indisponible pour ce nœud");
  if (!d.primaryChannel) throw new Error("lead non qualifié");
  return {
    router: env.router,
    context: env.context,
    lead: d.lead,
    leadId: d.leadId,
    inspection: d.inspection,
    remoteAppUrl: env.remoteAppUrl,
    demoUrl: d.demoUrl,
    usage: d.usage,
    onSubStep: env.onSubStep,
    def: d.def,
    primaryChannel: d.primaryChannel,
  };
}

/** Issue d'un nœud : `skipped` quand il n'a rien écrit, `note` quand il a tourné sans résultat. */
type NodeOutcome = { skipped: string } | { note: string } | void;

/** Exécute un nœud. */
async function runNode(node: WorkflowNodeType, d: Dossier, env: WorkflowEnv): Promise<NodeOutcome> {
  const prep = env.mode === "prep";
  switch (node.binding.kind) {
    case "module": {
      // Seul SIRENE arrive ici : les modules du site passent par `inspectPage`.
      await env.onSubStep?.(`🏛️ Recherche du dirigeant (SIRENE)...`);
      d.sirene = await lookupCompanySirene(d.lead.name, d.lead.city);
      return d.sirene.siren ? undefined : { note: "introuvable dans SIRENE" };
    }
    case "proof": {
      if (prep) return { skipped: "écrite par la file locale" };
      const { audit, demoHtml, competitorPixels } = await PROOF_GENERATORS[d.def.proof.generator](genContext(d, env));
      d.audit = audit;
      d.demoHtml = demoHtml;
      if (competitorPixels) d.competitorPixels = competitorPixels;
      return;
    }
    case "site_demo": {
      if (prep) return { skipped: "écrite par la file locale" };
      const focus = siteDemoFocus(d.def);
      if (!focus || !needsSiteDemo(d.def, d.lead, d.inspection)) return { skipped: "site non en cause" };
      // Même générateur que la preuve « démo de site », avec l'angle du bilan ; l'audit du bilan reste celui du lead.
      const ctx = genContext(d, env);
      const demoDef: OpportunityDefinition = { ...d.def, proof: { kind: "demo_web", generator: "llm_demo", focus, interestCta: d.def.proof.interestCta } };
      d.siteDemoHtml = (await PROOF_GENERATORS.llm_demo({ ...ctx, def: demoDef })).demoHtml;
      return;
    }
    case "flyer": {
      await env.onSubStep?.(`📄 Création du Flyer PDF commercial (QR Code)...`);
      d.flyerPdf = await generateFlyerPdf(env.context, d.lead, d.inspection?.logoUrl ?? null, d.inspection?.dominantColors[0] ?? "#1d4ed8");
      return;
    }
    case "pitch": {
      if (node.binding.generator !== pitchGeneratorFor(d.def, d.primaryChannel)) return { skipped: "canal non principal pour ce lead" };
      if (prep) return { skipped: "écrit par la file locale" };
      if (!d.audit) throw new Error("preuve absente");
      d.battlecard = await PITCH_GENERATORS[node.binding.generator](genContext(d, env), d.audit);
      return;
    }
    case "fixed": {
      if (node.id !== "qualify") return { skipped: "sans action pendant le scan" };
      d.qualification = qualifyAfterInspection(d.def, d.lead, d.inspection);
      d.primaryChannel = d.qualification.qualified ? d.qualification.primaryChannel : null;
      if (!d.primaryChannel) return { skipped: "prérequis non remplis" };
      await env.onSubStep?.(`✅ Prérequis remplis : canal principal ${CHANNEL_LABELS[d.primaryChannel]}`);
      return;
    }
    default:
      return { skipped: "sans action pendant le scan" };
  }
}

/** Une seule ouverture de page pour tous les modules qui lisent le site. */
async function inspectPage(modules: ScanModuleId[], d: Dossier, env: WorkflowEnv): Promise<void> {
  const site = d.lead.website!;
  await env.onSubStep?.(`🔍 Inspection réseau & RGPD à froid (${site.replace(/^https?:\/\//, "").slice(0, 30)})...`);
  try {
    d.inspection = await inspectSite(env.context, site, { modules, companyName: d.lead.name, city: d.lead.city, phone: d.lead.phone, activity: d.lead.activity });
  } catch (err) {
    log("inspect", `Impossible d'inspecter ${site} : ${(err as Error).message}`);
  }
}

/**
 * Fait tourner le workflow du besoin pour un lead. Lève `UnqualifiedLeadError` (avec ce qui a été mesuré) quand la
 * qualification l'écarte : rien n'est généré ensuite.
 */
export async function runLeadWorkflow(
  input: { def: OpportunityDefinition; lead: MapsLead; leadId: string; demoUrl: string },
  env: WorkflowEnv,
): Promise<Dossier> {
  const { def, lead } = input;
  const d: Dossier = {
    ...input,
    keys: initialKeys(def, lead),
    inspection: null,
    sirene: null,
    qualification: null,
    primaryChannel: null,
    audit: null,
    demoHtml: null,
    siteDemoHtml: null,
    competitorPixels: null,
    flyerPdf: null,
    battlecard: null,
    usage: [],
    trace: [],
  };
  const blocked = new Set(keysBlockedBy(def.requirements.website));
  if (!lead.website) await env.onSubStep?.(`🔍 Aucun site actuel : préparation de l'audit stratégique...`);

  const waves = leadWorkflowWaves(def);
  for (let w = 0; w < waves.length; w++) {
    const runnable: WorkflowNodeType[] = [];
    for (const id of waves[w]!) {
      const node = workflowNode(id)!;
      // En prep, la preuve est écrite plus tard par la file locale : la démo complémentaire le sera aussi.
      const deferred = env.mode === "prep" && node.binding.kind === "site_demo";
      const missing = deferred ? [] : node.reads.filter((k) => !d.keys.has(k));
      if (missing.length) d.trace.push({ node: id, wave: w, status: "skipped", ms: 0, note: `manque ${missing.map((k) => `« ${label(k)} »`).join(", ")}` });
      else runnable.push(node);
    }

    const page = runnable.filter(isPageModule);
    const tasks: Array<{ nodes: WorkflowNodeType[]; run: () => Promise<NodeOutcome> }> = runnable
      .filter((n) => !isPageModule(n))
      .map((n) => ({ nodes: [n], run: () => runNode(n, d, env) }));
    if (page.length) {
      tasks.unshift({
        nodes: page,
        run: () => inspectPage(page.map((n) => (n.binding as { module: ScanModuleId }).module), d, env),
      });
    }

    const settled = await Promise.allSettled(
      tasks.map(async (t) => {
        const started = Date.now();
        const outcome = await t.run();
        const ms = Date.now() - started;
        const skipped = Boolean(outcome && "skipped" in outcome);
        const note = outcome ? ("skipped" in outcome ? outcome.skipped : outcome.note) : undefined;
        for (const n of t.nodes) {
          d.trace.push({ node: n.id, wave: w, status: skipped ? "skipped" : "done", ms, ...(note ? { note } : {}) });
          if (!skipped) for (const k of n.writes) if (!blocked.has(k)) d.keys.add(k);
        }
      }),
    );
    mergeSirene(d);

    const failure = settled.find((s): s is PromiseRejectedResult => s.status === "rejected");
    if (failure) throw failure.reason;

    if (d.qualification && !d.primaryChannel) {
      throw new UnqualifiedLeadError(
        d.qualification,
        buildUnqualifiedPayload({
          id: d.leadId,
          lead,
          inspection: d.inspection,
          opportunityType: def.id,
          result: d.qualification,
          siren: d.sirene?.siren ?? null,
        }),
      );
    }
  }
  log("workflow", `${lead.name} : ${d.trace.map((t) => `${t.node}${t.status === "skipped" ? "·" : ""}`).join(" → ")}`);
  return d;
}

/** Dirigeants, SIREN et date de création : ceux de l'inspection (fusionnés avec SIRENE), sinon SIRENE seul. */
export function companyFacts(d: Pick<Dossier, "inspection" | "sirene">): SireneInfo {
  return {
    siren: d.inspection?.siren ?? d.sirene?.siren ?? null,
    keyPeople: d.inspection?.keyPeople?.length ? d.inspection.keyPeople : (d.sirene?.keyPeople ?? []),
    createdAt: d.inspection?.companyCreatedAt ?? d.sirene?.createdAt ?? null,
  };
}

/** Lead prêt pour le CRM (nœud « CRM et closer »). */
export function buildSyncPayload(d: Dossier): SyncPayload {
  const { lead, inspection } = d;
  if (!d.primaryChannel || !d.audit) throw new Error("dossier incomplet : lead non qualifié ou preuve absente");
  const facts = companyFacts(d);
  return {
    id: d.leadId,
    company_name: lead.name,
    activity: lead.activity,
    city: lead.city,
    phone: lead.phone,
    email: inspection?.emails?.[0] ?? null,
    website_url: lead.website,
    google_rating: lead.rating,
    google_reviews_count: lead.reviewsCount,
    opportunity_type: d.def.id,
    scanned_at: new Date().toISOString(),
    primary_channel: d.primaryChannel,
    contacts: buildLeadContacts(lead, inspection, d.primaryChannel),
    audit_data: {
      ...d.audit,
      logoUrl: inspection?.logoUrl ?? null,
      site_images: inspection?.siteImages ?? [],
      loadTimeMs: inspection?.loadTimeMs ?? null,
      isResponsive: inspection?.isResponsive ?? null,
      dominantColors: inspection?.dominantColors ?? [],
      recentReviews: lead.recentReviews,
      mapsUrl: lead.mapsUrl,
      emails: inspection?.emails ?? [],
      key_people: facts.keyPeople,
      stack: inspection?.stack ?? [],
      trackers_found: inspection?.trackersFound ?? [],
      tracker_requests: inspection?.trackerRequests ?? [],
      cmp_detected: inspection?.cmpDetected ?? null,
      social_links: inspection?.socialLinks ?? { linkedin: [], facebook: [], instagram: [] },
      siren: facts.siren,
      company_created_at: facts.createdAt,
      paid_ads_detected: inspection?.paidAdsDetected ?? [],
      is_https: inspection?.isHttps ?? null,
      copyright_year: inspection?.copyrightYear ?? null,
      obsolescence_signals: inspection?.obsolescenceSignals ?? [],
      maps_rank: lead.mapsRank ?? null,
      maps_query: lead.mapsQuery ?? null,
      maps_checked_at: lead.mapsCheckedAt ?? null,
      competitors: lead.competitors ?? [],
      seo: inspection?.seo ?? null,
      competitor_pixels: d.competitorPixels,
      report_url: d.demoUrl,
      workflow_trace: d.trace,
    },
    demo_html: d.demoHtml,
    site_demo_html: d.siteDemoHtml,
    flyer_pdf_base64: d.flyerPdf ? d.flyerPdf.toString("base64") : null,
    battlecard_data: d.battlecard,
    token_usage: d.usage,
  };
}
