import { trackersModule, classifyTrackerUrl, detectCmpFromHtml } from "./trackersModule";
import { techStackModule, detectTechStackFromHtml } from "./techStackModule";
import { contactsLegalModule, extractCleanEmails, extractKeyPeopleFromText } from "./contactsLegalModule";
import { socialLinksModule, extractSocialLinksFromHtml } from "./socialLinksModule";
import { sireneDirigeantModule, lookupCompanySirene, parseSireneApiResponse } from "./sireneDirigeantModule";
import { brandingVisualModule } from "./brandingVisualModule";
import { performanceMobileModule } from "./performanceMobileModule";
import { adsPixelSpyModule, detectPaidAdsFromHtml } from "./adsPixelSpyModule";
import { freshnessSslModule, extractCopyrightYearFromText, buildObsolescenceSignals } from "./freshnessSslModule";
import {
  ALL_SCAN_MODULES,
  OPPORTUNITY_SCAN_RECIPES,
  getModulesForOpportunity,
  type ScanModule,
  type ScanModuleContext,
  type ScanModuleId,
} from "./types";

export const SCAN_MODULES_REGISTRY: Record<ScanModuleId, ScanModule> = {
  trackers_cmp: trackersModule,
  ads_pixel_spy: adsPixelSpyModule,
  tech_stack: techStackModule,
  freshness_ssl: freshnessSslModule,
  contacts_legal: contactsLegalModule,
  social_links: socialLinksModule,
  dirigeant_sirene: sireneDirigeantModule,
  branding_visual: brandingVisualModule,
  perf_mobile: performanceMobileModule,
};

export function resolveScanModules(moduleIds: ScanModuleId[]): ScanModule[] {
  return moduleIds.map((id) => SCAN_MODULES_REGISTRY[id]).filter((m): m is ScanModule => Boolean(m));
}

export {
  ALL_SCAN_MODULES,
  OPPORTUNITY_SCAN_RECIPES,
  getModulesForOpportunity,
  classifyTrackerUrl,
  detectCmpFromHtml,
  detectTechStackFromHtml,
  extractCleanEmails,
  extractKeyPeopleFromText,
  extractSocialLinksFromHtml,
  lookupCompanySirene,
  parseSireneApiResponse,
  detectPaidAdsFromHtml,
  extractCopyrightYearFromText,
  buildObsolescenceSignals,
  type ScanModule,
  type ScanModuleContext,
  type ScanModuleId,
};
