/**
 * Bilans de visibilité et d'acquisition en mode préparation (sans modèle de langage) : le rapport est déterministe,
 * comme celui des traceurs. Il est écrit en `demo.html` avec les constats mesurés (`audit_facts.json`) ; l'agent
 * n'écrit que la battlecard (et la démo de site complémentaire quand `prompt_site_demo.md` existe).
 */
import type { OpportunityDefinition } from "../../shared/opportunities";
import { fetchCompetitorPixels, type CompetitorPixels } from "./collector/competitorPixels";
import { generateAcquisitionReportHtml } from "./generator/acquisitionReportGenerator";
import { acquisitionScore, scoreActions, visibilityScore } from "./generator/reportScoring";
import { generateVisibilityReportHtml } from "./generator/visibilityReportGenerator";
import { bilanLabel, type BilanKind } from "./copywriter/bilanPitch";
import { siteDemoUrl } from "./opportunities/siteDemo";
import type { MapsLead, SiteInspection } from "./types";
import type { PitchInput } from "./workflow/pitchFacts";
import { pitchInputFromDossier, type Dossier } from "./workflow/runner";

export interface BilanQueueFiles {
  demoHtml: string;
  /** Constats mesurés que le message peut citer (écrits en `audit_facts.json`). */
  auditFacts: Record<string, unknown>;
  /** Adresse de la démo de site complémentaire citée par le bilan, ou null si elle n'est pas demandée. */
  siteDemoUrl: string | null;
  /** Pixels des concurrents (acquisition), null pour la visibilité. */
  competitorPixels: CompetitorPixels[] | null;
}

/** Bilan de la preuve de l'offre, ou null si l'offre n'est pas un bilan. */
export async function buildBilanQueueFiles(p: {
  def: OpportunityDefinition;
  lead: MapsLead;
  inspection: SiteInspection | null;
  leadId: string;
  remoteAppUrl: string;
  fetcher?: typeof fetch;
}): Promise<BilanQueueFiles | null> {
  const { def, lead, inspection, leadId, remoteAppUrl } = p;
  const kind = def.proof.kind;
  if (kind !== "visibility_report" && kind !== "acquisition_report") return null;
  const demoUrl = siteDemoUrl(def, lead, inspection, remoteAppUrl, leadId);

  let competitorPixels: CompetitorPixels[] | undefined;
  let result;
  let demoHtml: string;
  let label: string;
  if (kind === "visibility_report") {
    result = visibilityScore(lead, inspection);
    demoHtml = generateVisibilityReportHtml({ leadId, lead, inspection, remoteAppUrl, siteDemoUrl: demoUrl });
    label = "Bilan de visibilité locale";
  } else {
    competitorPixels = await fetchCompetitorPixels(lead.competitors ?? [], p.fetcher);
    result = acquisitionScore(inspection, competitorPixels);
    demoHtml = generateAcquisitionReportHtml({ leadId, lead, inspection, competitorPixels, remoteAppUrl, siteDemoUrl: demoUrl });
    label = "Bilan d'acquisition";
  }

  const actions = scoreActions(result);
  const auditFacts: Record<string, unknown> = {
    kind,
    auditSummary: `${label} : ${result.score}/100 sur les critères mesurés.`,
    weaknesses: actions,
    score: { score: result.score, criteria: result.criteria, removed: result.removed },
    maps: {
      rank: lead.mapsRank ?? null,
      query: lead.mapsQuery ?? null,
      checkedAt: lead.mapsCheckedAt ?? null,
      rating: lead.rating ?? null,
      reviewsCount: lead.reviewsCount ?? null,
      noMapsListing: lead.noMapsListing === true,
    },
    competitors: [...(lead.competitors ?? [])].sort((a, b) => a.rank - b.rank),
    ...(competitorPixels ? { competitorPixels } : {}),
    actions,
  };
  return { demoHtml, auditFacts, siteDemoUrl: demoUrl, competitorPixels: competitorPixels ?? null };
}

/**
 * Entrée de la consigne des textes commerciaux en mode préparation : celle du dossier, sauf le bilan et les pixels des
 * concurrents, que la file écrit elle-même (le dossier n'a pas d'audit, la preuve n'étant pas générée par le modèle).
 */
export function prepPitchInput(dossier: Dossier, bilan: BilanQueueFiles | null, remoteAppUrl: string, pitchFocus?: string | null): PitchInput {
  const input = pitchInputFromDossier(dossier, remoteAppUrl);
  // Angle demandé en ligne de commande (`--pitch_focus`) : prioritaire sur celui de la définition.
  const focus = pitchFocus?.trim();
  const base = focus ? { ...input, def: { ...input.def, commercial: { ...input.def.commercial, pitchFocus: focus } } } : input;
  if (!bilan) return { ...base, report: null, competitorPixels: null, siteDemoUrl: null };
  const facts = bilan.auditFacts as { score: { score: number }; weaknesses: string[] };
  return {
    ...base,
    report: { score: facts.score.score, actions: facts.weaknesses },
    competitorPixels: bilan.competitorPixels,
    siteDemoUrl: bilan.siteDemoUrl,
  };
}

/**
 * En-tête de `prompt_battlecard.md` en mode préparation, avant la consigne assemblée. Quand la preuve est un bilan,
 * il rappelle que `demo.html` est déjà écrit par la file : l'agent ne le réécrit pas. (Propre à ce mode : la consigne
 * assemblée, identique dans les deux modes, n'en parle pas.)
 */
export function prepBattlecardHeader(leadDir: string, bilan: BilanKind | null): string {
  const lines = ["# Consigne de génération du battlecard", "", `Enregistre le JSON valide dans : \`${leadDir}/battlecard.json\``];
  if (bilan) {
    lines.push("", `\`demo.html\` (le ${bilanLabel(bilan)}) est déjà écrit : ne le réécris pas.`);
  }
  return lines.join("\n");
}
