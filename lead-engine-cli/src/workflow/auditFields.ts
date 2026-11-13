import type { CompetitorPixels } from "../collector/competitorPixels";
import type { MapsLead, SiteInspection } from "../types";

/**
 * Données de Maps et de référencement conservées dans `audit_data` pour que le closer les voie
 * (partagé par le worker, le premier envoi de prep et sync-queue : une seule liste de clés).
 */
export function mapsSeoAuditFields(lead: MapsLead, inspection: SiteInspection | null, competitorPixels: CompetitorPixels[] | null) {
  return {
    maps_rank: lead.mapsRank ?? null,
    maps_query: lead.mapsQuery ?? null,
    maps_checked_at: lead.mapsCheckedAt ?? null,
    competitors: lead.competitors ?? [],
    seo: inspection?.seo ?? null,
    competitor_pixels: competitorPixels,
  };
}
