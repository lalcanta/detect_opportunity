/**
 * Message et dossier du closer quand la preuve est un bilan : le lien `/demos/:id` ouvre le bilan, pas une maquette
 * de site. La démo de site, si elle est produite, n'est qu'un complément éventuel. Les faits cités viennent du bilan.
 */
import type { MapsLead, SiteAudit } from "../types";
import { dateFr } from "../generator/reportLayout";

export interface BilanPitch {
  kind: "visibility_report" | "acquisition_report";
  /** Démo de site complémentaire (`/demos/:id/site`), null si elle n'est pas produite. */
  siteDemoUrl: string | null;
}

export function bilanLabel(kind: BilanPitch["kind"]): string {
  return kind === "visibility_report" ? "bilan de visibilité locale" : "bilan d'acquisition";
}

/** Position Maps telle que mesurée, sans rien supposer quand elle ne l'est pas. */
function rankFact(lead: MapsLead): string {
  if (typeof lead.mapsRank === "number") return `position ${lead.mapsRank}`;
  if (lead.noMapsListing) return "non mesurée (aucune fiche Google Maps relevée)";
  return lead.mapsQuery ? "hors des résultats relevés" : "non mesurée";
}

/** Faits du bilan à reprendre tels quels dans le message (rien d'autre n'est chiffré). */
export function bilanPromptFacts(b: BilanPitch, lead: MapsLead, audit: SiteAudit, reportUrl: string): string {
  const query = lead.mapsQuery?.trim();
  const date = dateFr(lead.mapsCheckedAt);
  const competitors = [...(lead.competitors ?? [])]
    .sort((a, c) => a.rank - c.rank)
    .slice(0, 5)
    .map((c) => `${c.rank}. ${c.name} (note ${c.rating ?? "non relevée"}, ${c.reviewsCount ?? "nombre d'avis non relevé"}${typeof c.reviewsCount === "number" ? " avis" : ""})`);
  return [
    `Lien du ${bilanLabel(b.kind)} déjà préparé pour lui : ${reportUrl} — c'est un bilan chiffré de sa situation, pas une maquette de site.`,
    `Recherche Google Maps : ${query ? `« ${query} »` : "non relevée"}${date ? `, constat du ${date}` : ""}. Sa position : ${rankFact(lead)}.`,
    `Concurrents relevés : ${competitors.length ? competitors.join(" ; ") : "aucun"}.`,
    `Score du bilan : ${audit.score}/100 sur les critères mesurés. Actions prioritaires : ${audit.weaknesses.join(" ; ") || "aucune"}.`,
    b.siteDemoUrl
      ? `Démo de site : complément éventuel (${b.siteDemoUrl}), jamais l'offre principale ; le lien principal reste le bilan.`
      : "Aucune démo de site n'est produite : ne propose pas de nouveau site.",
    "Ne cite que ces faits : aucun chiffre inventé (ni appels perdus, ni chiffre d'affaires, ni trafic).",
  ].join("\n");
}
