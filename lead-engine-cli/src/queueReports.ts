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
import { siteDemoUrl } from "./opportunities/siteDemo";
import type { MapsLead, SiteInspection } from "./types";

export interface BilanQueueFiles {
  demoHtml: string;
  /** Constats mesurés que le message peut citer (écrits en `audit_facts.json`). */
  auditFacts: Record<string, unknown>;
  /** Adresse de la démo de site complémentaire citée par le bilan, ou null si elle n'est pas demandée. */
  siteDemoUrl: string | null;
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
    },
    competitors: [...(lead.competitors ?? [])].sort((a, b) => a.rank - b.rank),
    ...(competitorPixels ? { competitorPixels } : {}),
    actions,
  };
  return { demoHtml, auditFacts, siteDemoUrl: demoUrl };
}

/** Règles ajoutées à `prompt_battlecard.md` d'un bilan : chiffres tirés de `audit_facts.json` uniquement. */
export function bilanBattlecardRules(p: { siteDemoUrl: string | null }): string {
  return `
## Bilan déjà généré : règles du message (impératif)
- \`demo.html\` (le bilan) est déjà écrit : ne le réécris pas. Cite **uniquement** les faits de \`audit_facts.json\`
  (score, critères, rang Maps avec la recherche telle qu'elle a été lancée et sa date, concurrents, pixels des
  concurrents, 3 actions). N'invente aucun chiffre : ni appels perdus, ni chiffre d'affaires, ni trafic.
- Un pixel « non vérifié » (\`null\`) n'est pas « aucun pixel » : ne l'affirme jamais.
- Angle commercial : abonnement de visibilité locale / publicité en ligne pour corriger les points relevés par le bilan.
${
  p.siteDemoUrl
    ? `- Une démo de site complémentaire est demandée (${p.siteDemoUrl}) : mentionne la refonte du site comme un complément, jamais comme l'offre principale.`
    : "- Aucune démo de site n'est demandée : reste sur la visibilité, sans proposer de nouveau site."
}
`;
}
