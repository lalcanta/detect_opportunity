import type { Page } from "playwright";
import type { SiteInspection } from "../../types";

export type ScanModuleId =
  | "trackers_cmp"
  | "tech_stack"
  | "contacts_legal"
  | "social_links"
  | "dirigeant_sirene"
  | "branding_visual"
  | "perf_mobile"
  | "ads_pixel_spy"
  | "freshness_ssl";

export interface ScanModuleContext {
  page: Page;
  url: string;
  companyName?: string;
  city?: string | null;
  result: SiteInspection;
}

export interface ScanModule {
  id: ScanModuleId;
  label: string;
  description: string;
  /** Hook exécuté AVANT page.goto() (ex: attacher les écouteurs réseau à froid). */
  beforeNavigate?: (ctx: ScanModuleContext) => Promise<void> | void;
  /** Hook exécuté APRÈS le chargement initial du DOM (1366x768). */
  afterNavigate?: (ctx: ScanModuleContext) => Promise<void> | void;
}

/**
 * Recettes de modules par type d'opportunité :
 * chaque opportunité assemble uniquement les briques dont elle a besoin.
 */
export const OPPORTUNITY_SCAN_RECIPES: Record<string, ScanModuleId[]> = {
  audit_qa_trackers: ["trackers_cmp", "ads_pixel_spy", "tech_stack", "contacts_legal", "social_links", "dirigeant_sirene", "branding_visual", "freshness_ssl"],
  website: ["branding_visual", "perf_mobile", "freshness_ssl", "ads_pixel_spy", "contacts_legal", "social_links", "dirigeant_sirene", "tech_stack"],
  google_reviews: ["branding_visual", "contacts_legal", "social_links", "dirigeant_sirene", "perf_mobile", "freshness_ssl"],
  seo_local: ["perf_mobile", "freshness_ssl", "ads_pixel_spy", "tech_stack", "contacts_legal", "social_links", "dirigeant_sirene", "branding_visual"],
  ads_acquisition: ["trackers_cmp", "ads_pixel_spy", "perf_mobile", "freshness_ssl", "contacts_legal", "social_links", "dirigeant_sirene", "branding_visual"],
  custom: ["trackers_cmp", "ads_pixel_spy", "tech_stack", "freshness_ssl", "contacts_legal", "social_links", "dirigeant_sirene", "branding_visual", "perf_mobile"],
};

export const ALL_SCAN_MODULES: ScanModuleId[] = [
  "trackers_cmp",
  "ads_pixel_spy",
  "tech_stack",
  "freshness_ssl",
  "contacts_legal",
  "social_links",
  "dirigeant_sirene",
  "branding_visual",
  "perf_mobile",
];

export function getModulesForOpportunity(opportunityType?: string | null): ScanModuleId[] {
  if (!opportunityType) return ALL_SCAN_MODULES;
  return OPPORTUNITY_SCAN_RECIPES[opportunityType] ?? ALL_SCAN_MODULES;
}
