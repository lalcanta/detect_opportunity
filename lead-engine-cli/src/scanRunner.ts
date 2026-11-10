import { mkdir, writeFile } from "node:fs/promises";
import { chromium, type Browser, type BrowserContext } from "playwright";
import type { Config } from "./config";
import type { ModelRouter } from "./llm/modelRouter";
import { scrapeMaps } from "./collector/mapsScraper";
import { inspectSite, lookupCompanySirene } from "./inspector/siteInspector";
import { generateFlyerPdf } from "./generator/flyerGenerator";
import { PITCH_GENERATORS, PROOF_GENERATORS, type GenerationContext } from "./opportunities/generators";
import { getOpportunityOrDefault, opportunityIdOf } from "../../shared/opportunities";
import { pushLead } from "./sync/pushLead";
import { leadId, log, parseDirectDomainLeads } from "./utils/helpers";
import type { MapsLead, SyncPayload, TokenUsageRecord } from "./types";

export interface ScanOptions {
  query: string;
  city: string;
  limit: number;
  lat?: number | null;
  lng?: number | null;
  radius_km?: number | null;
  cdp: boolean;
  dryRun: boolean;
  opportunity_type?: string;
  website_filter?: "all" | "no_website" | "has_website";
}

export interface ScanHooks {
  /** Appelé après chaque étape ; retourner false pour interrompre le scan (annulation). */
  onProgress?: (processed: number, total: number, message: string) => Promise<boolean | void>;
}

export interface ScanResult {
  processed: number;
  total: number;
  cancelled: boolean;
}

export async function runScan(
  opts: ScanOptions,
  cfg: Config,
  router: ModelRouter,
  hooks: ScanHooks = {},
): Promise<ScanResult> {
  let browser: Browser;
  let context: BrowserContext;
  if (opts.cdp) {
    log("browser", `Connexion CDP à ${cfg.CDP_URL}`);
    browser = await chromium.connectOverCDP(cfg.CDP_URL).catch((err: Error) => {
      throw new Error(`Chrome CDP injoignable sur ${cfg.CDP_URL} (lancez Chrome avec --remote-debugging-port=9222) : ${err.message}`);
    });
    context = browser.contexts()[0] ?? (await browser.newContext({ ignoreHTTPSErrors: true }));
  } else {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({
      locale: "fr-FR",
      viewport: { width: 1366, height: 768 },
      ignoreHTTPSErrors: true,
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    });
  }
  await context.addInitScript(() => {
    (globalThis as any).__name = (fn: any) => fn;
    (window as any).__name = (fn: any) => fn;
  });

  try {
    const directLeads = parseDirectDomainLeads(opts.query, opts.city);
    let prospects: MapsLead[] = [];
    let potentialCount = 0;

    if (directLeads) {
      prospects = directLeads.slice(0, opts.limit);
      potentialCount = prospects.length;
      log("main", `Mode Audit Direct B2B : ${prospects.length} domaine(s) ciblé(s) sans passer par Google Maps`);
      if ((await hooks.onProgress?.(0, prospects.length, `Étape 1/2 : ${prospects.length} domaine(s) B2B chargé(s) en direct. Démarrage de l'inspection réseau & RGPD...`)) === false) {
        return { processed: 0, total: prospects.length, cancelled: true };
      }
    } else {
      if ((await hooks.onProgress?.(0, opts.limit, `Étape 1/2 : Connexion & cartographie Google Maps (objectif : ${opts.limit} qualifiés)...`)) === false) {
        return { processed: 0, total: 0, cancelled: true };
      }
      const scraped = await scrapeMaps({
        query: opts.query,
        city: opts.city,
        limit: opts.limit,
        lat: opts.lat,
        lng: opts.lng,
        radius_km: opts.radius_km,
        context,
        interactive: opts.cdp,
        opportunityType: opts.opportunity_type,
        websiteFilter: opts.website_filter,
        onProgress: async (msg, qCount) => {
          const proceed = await hooks.onProgress?.(qCount ?? 0, opts.limit, `Étape 1/2 : ${msg}`);
          return proceed !== false;
        },
      });
      prospects = scraped.qualifiedLeads;
      potentialCount = scraped.potentialCount;
      log("main", `${prospects.length} prospects qualifiés trouvés sur ${potentialCount} fiches potentielles repérées`);

      if (prospects.length === 0) {
        await hooks.onProgress?.(0, opts.limit, `Aucun prospect qualifié trouvé sur la zone (${potentialCount} fiches potentielles analysées).`);
        return { processed: 0, total: 0, cancelled: false };
      }

      if ((await hooks.onProgress?.(0, prospects.length, `Étape 2/2 : ${prospects.length} prospects qualifiés trouvés (sur ${potentialCount} potentiels repérés). Démarrage des audits & preuves...`)) === false) {
        return { processed: 0, total: prospects.length, cancelled: true };
      }
    }

    let ok = 0;
    let done = 0;
    for (let i = 0; i < prospects.length; i++) {
      const lead = prospects[i];
      if (!lead) continue;
      const prefix = `[Qualifié ${i + 1}/${prospects.length}] ${lead.name}`;

      if ((await hooks.onProgress?.(done, prospects.length, `${prefix} : Démarrage... (${done}/${prospects.length} qualifiés traités · ${potentialCount} potentiels repérés)`)) === false) {
        return { processed: ok, total: prospects.length, cancelled: true };
      }
      try {
        const payload = await processLead(
          lead,
          router,
          context,
          cfg.REMOTE_APP_URL,
          async (subStep) => {
            const proceed = await hooks.onProgress?.(done, prospects.length, `${prefix} : ${subStep} (${done}/${prospects.length} qualifiés traités · ${potentialCount} potentiels repérés)`);
            return proceed !== false;
          },
          opts.opportunity_type,
        );

        if (opts.dryRun) {
          await saveLocally(payload);
        } else {
          await hooks.onProgress?.(done, prospects.length, `${prefix} : ☁️ Envoi vers le Cloud CRM... (${done}/${prospects.length} qualifiés traités · ${potentialCount} potentiels repérés)`);
          await pushLead(cfg.REMOTE_APP_URL, cfg.SYNC_SECRET_TOKEN, payload);
        }
        ok++;
        done++;
        await hooks.onProgress?.(done, prospects.length, `✔ ${prefix} synchronisé (${ok}/${prospects.length} qualifiés · ${potentialCount} potentiels repérés)`);
      } catch (err) {
        done++;
        log("main", `✘ ${lead.name} : ${(err as Error).message}`);
        await hooks.onProgress?.(done, prospects.length, `⚠️ Échec sur ${prefix} : ${(err as Error).message.slice(0, 100)}`);
      }
    }
    await hooks.onProgress?.(done, prospects.length, `🎉 Scan terminé : ${ok}/${prospects.length} leads qualifiés synchronisés dans le CRM (sur ${potentialCount} potentiels repérés sur la zone)`);
    log("main", `Terminé : ${ok}/${prospects.length} leads traités`);
    return { processed: ok, total: prospects.length, cancelled: false };
  } finally {
    // En mode CDP, close() ne fait que se déconnecter : le Chrome de l'utilisateur reste ouvert.
    await browser.close().catch(() => undefined);
  }
}

async function processLead(
  lead: MapsLead,
  router: ModelRouter,
  context: BrowserContext,
  remoteAppUrl: string,
  onSubStep?: (subStep: string) => Promise<boolean | void>,
  opportunityType?: string,
): Promise<SyncPayload> {
  const usage: TokenUsageRecord[] = [];
  const id = leadId(lead.name, lead.phone ?? lead.mapsUrl);
  const demoUrl = `${remoteAppUrl}/demos/${id}`;
  log("lead", `→ ${lead.name} (${id}) [${opportunityIdOf(opportunityType)}]`);

  if (lead.website) {
    await onSubStep?.(`🔍 Inspection réseau & RGPD à froid (${lead.website.replace(/^https?:\/\//, "").slice(0, 30)})...`);
  } else {
    await onSubStep?.(`🔍 Aucun site actuel : préparation de l'audit stratégique...`);
  }
  const inspection = lead.website
    ? await inspectSite(context, lead.website, { opportunityType, companyName: lead.name, city: lead.city })
    : null;
  const sireneFallback = !inspection ? await lookupCompanySirene(lead.name, lead.city) : null;

  const def = getOpportunityOrDefault(opportunityType);
  const genCtx: GenerationContext = { router, context, lead, leadId: id, inspection, remoteAppUrl, demoUrl, usage, onSubStep };

  const { audit, demoHtml } = await PROOF_GENERATORS[def.proof.generator](genCtx);

  let flyerBase64: string | null = null;
  if (def.flyer) {
    await onSubStep?.(`📄 Création du Flyer PDF commercial (QR Code)...`);
    const flyer = await generateFlyerPdf(context, lead, inspection?.logoUrl ?? null, inspection?.dominantColors[0] ?? "#1d4ed8");
    flyerBase64 = flyer.toString("base64");
  }

  const battlecard = await PITCH_GENERATORS[def.pitch.generator](genCtx, audit, def.pitch.kind);

  return {
    id,
    company_name: lead.name,
    activity: lead.activity,
    city: lead.city,
    phone: lead.phone,
    email: inspection?.emails?.[0] ?? null,
    website_url: lead.website,
    google_rating: lead.rating,
    google_reviews_count: lead.reviewsCount,
    opportunity_type: opportunityIdOf(opportunityType),
    audit_data: {
      ...audit,
      logoUrl: inspection?.logoUrl ?? null,
      loadTimeMs: inspection?.loadTimeMs ?? null,
      isResponsive: inspection?.isResponsive ?? null,
      dominantColors: inspection?.dominantColors ?? [],
      recentReviews: lead.recentReviews,
      mapsUrl: lead.mapsUrl,
      emails: inspection?.emails ?? [],
      key_people: inspection?.keyPeople?.length ? inspection.keyPeople : (sireneFallback?.keyPeople ?? []),
      stack: inspection?.stack ?? [],
      trackers_found: inspection?.trackersFound ?? [],
      tracker_requests: inspection?.trackerRequests ?? [],
      cmp_detected: inspection?.cmpDetected ?? null,
      social_links: inspection?.socialLinks ?? { linkedin: [], facebook: [], instagram: [] },
      siren: inspection?.siren ?? sireneFallback?.siren ?? null,
      company_created_at: inspection?.companyCreatedAt ?? sireneFallback?.createdAt ?? null,
      paid_ads_detected: inspection?.paidAdsDetected ?? [],
      is_https: inspection?.isHttps ?? null,
      copyright_year: inspection?.copyrightYear ?? null,
      obsolescence_signals: inspection?.obsolescenceSignals ?? [],
      report_url: demoUrl,
    },
    demo_html: demoHtml,
    flyer_pdf_base64: flyerBase64,
    battlecard_data: battlecard,
    token_usage: usage,
  };
}

async function saveLocally(p: SyncPayload): Promise<void> {
  const dir = `output/${p.id}`;
  await mkdir(dir, { recursive: true });
  await writeFile(`${dir}/demo.html`, p.demo_html || "");
  if (p.flyer_pdf_base64) await writeFile(`${dir}/flyer.pdf`, Buffer.from(p.flyer_pdf_base64, "base64"));
  const { demo_html: _d, flyer_pdf_base64: _f, ...meta } = p;
  await writeFile(`${dir}/lead.json`, JSON.stringify(meta, null, 2));
  log("dry-run", `Écrit dans ${dir}`);
}
