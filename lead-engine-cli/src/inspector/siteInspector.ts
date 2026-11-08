import type { BrowserContext } from "playwright";
import type { SiteInspection } from "../types";
import {
  ALL_SCAN_MODULES,
  OPPORTUNITY_SCAN_RECIPES,
  SCAN_MODULES_REGISTRY,
  buildObsolescenceSignals,
  classifyTrackerUrl,
  detectCmpFromHtml,
  detectPaidAdsFromHtml,
  detectTechStackFromHtml,
  extractCleanEmails,
  extractCopyrightYearFromText,
  extractKeyPeopleFromText,
  extractSocialLinksFromHtml,
  getModulesForOpportunity,
  lookupCompanySirene,
  parseSireneApiResponse,
  resolveScanModules,
  type ScanModuleId,
} from "./modules";

export {
  ALL_SCAN_MODULES,
  OPPORTUNITY_SCAN_RECIPES,
  SCAN_MODULES_REGISTRY,
  buildObsolescenceSignals,
  classifyTrackerUrl,
  detectCmpFromHtml,
  detectPaidAdsFromHtml,
  detectTechStackFromHtml,
  extractCleanEmails,
  extractCopyrightYearFromText,
  extractKeyPeopleFromText,
  extractSocialLinksFromHtml,
  getModulesForOpportunity,
  lookupCompanySirene,
  parseSireneApiResponse,
  resolveScanModules,
  type ScanModuleId,
};

export interface InspectSiteOptions {
  opportunityType?: string | null;
  modules?: ScanModuleId[];
  companyName?: string;
  city?: string | null;
}

/**
 * Orchestrateur d'inspection modulaire :
 * Exécute uniquement les mini-modules pertinents pour le type d'opportunité ciblé,
 * en une seule ouverture de page Playwright.
 */
export async function inspectSite(
  context: BrowserContext,
  rawUrl: string,
  opts: InspectSiteOptions = {},
): Promise<SiteInspection> {
  const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  const activeModuleIds = opts.modules?.length ? opts.modules : getModulesForOpportunity(opts.opportunityType);
  const activeModules = resolveScanModules(activeModuleIds);

  const result: SiteInspection = {
    url,
    title: null,
    loadTimeMs: null,
    isResponsive: null,
    dominantColors: [],
    logoUrl: null,
    screenshot: null,
    emails: [],
    keyPeople: [],
    stack: [],
    trackersFound: [],
    trackerRequests: [],
    cmpDetected: null,
    socialLinks: { linkedin: [], facebook: [], instagram: [] },
    siren: null,
    companyCreatedAt: null,
  };

  const page = await context.newPage();
  // Sécurise l'exécution Playwright contre l'injection de __name par esbuild/tsx
  await page.addInitScript(() => {
    (globalThis as any).__name = (fn: any) => fn;
    (window as any).__name = (fn: any) => fn;
  });
  const ctx = { page, url, companyName: opts.companyName, city: opts.city, result };

  try {
    // 1. Hooks avant navigation (ex: écouteurs réseau à froid pour traceurs RGPD)
    for (const mod of activeModules) {
      await mod.beforeNavigate?.(ctx);
    }

    // 2. Navigation initiale en viewport desktop avec gestion de robustesse (timeout & fallback http)
    await page.setViewportSize({ width: 1366, height: 768 });
    const started = Date.now();
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
    } catch (navErr) {
      if (url.startsWith("https://")) {
        const httpFallback = url.replace(/^https:\/\//i, "http://");
        await page.goto(httpFallback, { waitUntil: "domcontentloaded", timeout: 15_000 });
      } else {
        throw navErr;
      }
    }
    result.loadTimeMs = Date.now() - started;
    result.title = await page.title().catch(() => null);

    // 3. Hooks après navigation pour chaque brique activée
    for (const mod of activeModules) {
      await mod.afterNavigate?.(ctx);
    }
  } catch (err) {
    result.error = (err as Error).message.split("\n")[0] ?? "inspection failed";
  } finally {
    await page.close().catch(() => undefined);
  }

  return result;
}
