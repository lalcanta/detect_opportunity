import type { Page } from "playwright";
import type { SiteInspection } from "../../types";

export type { ScanModuleId } from "../../../../shared/opportunities";
import { SCAN_MODULE_IDS, scanModulesFor, type ScanModuleId } from "../../../../shared/opportunities";

export interface ScanModuleContext {
  page: Page;
  url: string;
  companyName?: string;
  city?: string | null;
  phone?: string | null;
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

/** Toutes les vérifications, pour une opportunité inconnue ou absente. */
export const ALL_SCAN_MODULES: ScanModuleId[] = [...SCAN_MODULE_IDS];

/** Vérifications déclarées par l'opportunité dans shared/opportunities. */
export function getModulesForOpportunity(opportunityType?: string | null): ScanModuleId[] {
  return [...scanModulesFor(opportunityType)];
}
