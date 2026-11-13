/**
 * Démo de site complémentaire d'un bilan (nœud `site_demo`) : quand la produire et avec quel angle.
 * Un critère non mesuré (inspection absente, module non lancé) ne déclenche jamais la démo.
 */
import type { DemoFocus, OpportunityDefinition } from "../../../shared/opportunities";
import type { MapsLead, SiteInspection } from "../types";

const SLOW_MS = 3000;

const isSlow = (i: SiteInspection | null): boolean => typeof i?.loadTimeMs === "number" && i.loadTimeMs > SLOW_MS;
const notMobile = (i: SiteInspection | null): boolean => i?.isResponsive === false;

/** Angle de la démo complémentaire, selon le bilan ; null si la preuve n'est pas un bilan. */
export function siteDemoFocus(def: OpportunityDefinition): DemoFocus | null {
  if (def.proof.kind === "visibility_report") return "seo_local";
  if (def.proof.kind === "acquisition_report") return "ads_acquisition";
  return null;
}

/**
 * Faut-il joindre une démo de site au bilan ? `always` / `never` tranchent ; `auto` (défaut) :
 * - visibilité : pas de site, site non adapté au mobile, métier ou ville absent du titre et du H1 (prospect avec fiche
 *   Maps seulement), ou chargement > 3 s ;
 * - acquisition : ni lien `tel:` ni formulaire, site non adapté au mobile, ou chargement > 3 s.
 */
export function needsSiteDemo(def: OpportunityDefinition, lead: MapsLead, inspection: SiteInspection | null): boolean {
  if (!siteDemoFocus(def)) return false;
  const mode = def.complementDemo ?? "auto";
  if (mode === "always") return true;
  if (mode === "never") return false;

  const i = inspection;
  if (def.proof.kind === "visibility_report") {
    if (!lead.website) return true;
    const seo = i?.seo;
    // Sans fiche Maps, métier et ville sont de remplissage : leur absence du titre ne prouve rien.
    const keywordsMissing = Boolean(!lead.noMapsListing && seo && (!seo.activityInTitleOrH1 || !seo.cityInTitleOrH1));
    return notMobile(i) || keywordsMissing || isSlow(i);
  }
  // `contactForm` : null = cherché sans succès, undefined = non cherché (critère ignoré).
  const noContactPath = i?.seo !== undefined && !i.seo.hasTelLink && i.contactForm === null;
  return noContactPath || notMobile(i) || isSlow(i);
}

/** Adresse de la démo complémentaire citée par le bilan, ou null si elle ne sera pas produite (partagée par le worker et la file locale). */
export function siteDemoUrl(
  def: OpportunityDefinition,
  lead: MapsLead,
  inspection: SiteInspection | null,
  remoteAppUrl: string,
  leadId: string,
): string | null {
  return needsSiteDemo(def, lead, inspection) ? `${remoteAppUrl}/demos/${leadId}/site` : null;
}
