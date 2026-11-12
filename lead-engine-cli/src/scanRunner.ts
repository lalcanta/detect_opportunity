import { mkdir, writeFile } from "node:fs/promises";
import { chromium, type Browser, type BrowserContext } from "playwright";
import type { Config } from "./config";
import type { ModelRouter } from "./llm/modelRouter";
import { scrapeMaps } from "./collector/mapsScraper";
import { getOpportunityOrDefault, needsInspectionToQualify, resolveWebsiteFilter } from "../../shared/opportunities";
import { UnqualifiedLeadError } from "./opportunities/qualify";
import { buildSyncPayload, runLeadWorkflow } from "./workflow/runner";
import { pushLead } from "./sync/pushLead";
import { leadId, log, parseDirectDomainLeads } from "./utils/helpers";
import type { MapsLead, SyncPayload } from "./types";

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

  const def = getOpportunityOrDefault(opts.opportunity_type);
  const websiteFilter = resolveWebsiteFilter(def, opts.website_filter);
  if (websiteFilter.error) log("main", `⚠️ ${websiteFilter.error} Filtre appliqué : ${websiteFilter.filter}`);
  // Quand l'email ou le formulaire décident de la qualification, il faut inspecter plus de sites que l'objectif.
  const target = opts.limit;
  const candidateLimit = needsInspectionToQualify(def) ? Math.min(target * 2, target + 20) : target;

  try {
    const directLeads = parseDirectDomainLeads(opts.query, opts.city);
    let prospects: MapsLead[] = [];
    let potentialCount = 0;

    if (directLeads) {
      prospects = directLeads.slice(0, candidateLimit);
      potentialCount = prospects.length;
      log("main", `Mode Audit Direct B2B : ${prospects.length} domaine(s) ciblé(s) sans passer par Google Maps`);
      if ((await hooks.onProgress?.(0, target, `Étape 1/2 : ${prospects.length} domaine(s) B2B chargé(s) en direct. Démarrage de l'inspection réseau & RGPD...`)) === false) {
        return { processed: 0, total: target, cancelled: true };
      }
    } else {
      if ((await hooks.onProgress?.(0, target, `Étape 1/2 : Connexion & cartographie Google Maps (objectif : ${target} qualifiés)...`)) === false) {
        return { processed: 0, total: 0, cancelled: true };
      }
      const scraped = await scrapeMaps({
        query: opts.query,
        city: opts.city,
        limit: candidateLimit,
        lat: opts.lat,
        lng: opts.lng,
        radius_km: opts.radius_km,
        context,
        interactive: opts.cdp,
        opportunityType: opts.opportunity_type,
        websiteFilter: websiteFilter.filter,
        onProgress: async (msg, qCount) => {
          const proceed = await hooks.onProgress?.(Math.min(qCount ?? 0, target), target, `Étape 1/2 : ${msg}`);
          return proceed !== false;
        },
      });
      prospects = scraped.qualifiedLeads;
      potentialCount = scraped.potentialCount;
      log("main", `${prospects.length} prospects retenus sur ${potentialCount} fiches potentielles repérées`);

      if (prospects.length === 0) {
        await hooks.onProgress?.(0, target, `Aucun prospect qualifié trouvé sur la zone (${potentialCount} fiches potentielles analysées).`);
        return { processed: 0, total: 0, cancelled: false };
      }

      if ((await hooks.onProgress?.(0, target, `Étape 2/2 : ${prospects.length} prospects retenus (sur ${potentialCount} potentiels repérés). Démarrage des audits & preuves...`)) === false) {
        return { processed: 0, total: target, cancelled: true };
      }
    }

    let ok = 0;
    let rejected = 0;
    for (let i = 0; i < prospects.length && ok < target; i++) {
      const lead = prospects[i];
      if (!lead) continue;
      const prefix = `[Candidat ${i + 1}/${prospects.length}] ${lead.name}`;
      const counters = () => `${ok}/${target} qualifiés · ${rejected} écarté(s) · ${potentialCount} potentiels repérés`;

      if ((await hooks.onProgress?.(ok, target, `${prefix} : Démarrage... (${counters()})`)) === false) {
        return { processed: ok, total: target, cancelled: true };
      }
      try {
        const payload = await processLead(
          lead,
          router,
          context,
          cfg.REMOTE_APP_URL,
          async (subStep) => {
            const proceed = await hooks.onProgress?.(ok, target, `${prefix} : ${subStep} (${counters()})`);
            return proceed !== false;
          },
          opts.opportunity_type,
        );

        if (opts.dryRun) {
          await saveLocally(payload);
        } else {
          await hooks.onProgress?.(ok, target, `${prefix} : ☁️ Envoi vers le Cloud CRM... (${counters()})`);
          await pushLead(cfg.REMOTE_APP_URL, cfg.SYNC_SECRET_TOKEN, payload);
        }
        ok++;
        await hooks.onProgress?.(ok, target, `✔ ${prefix} synchronisé (${counters()})`);
      } catch (err) {
        if (err instanceof UnqualifiedLeadError) {
          rejected++;
          log("main", `⚪ ${lead.name} écarté : ${err.message}`);
          // Gardé dans le CRM en `unqualified` (hors Kanban) : pas réinspecté, réutilisable pour une autre opportunité.
          if (err.payload && !opts.dryRun) {
            await pushLead(cfg.REMOTE_APP_URL, cfg.SYNC_SECRET_TOKEN, err.payload).catch((e: Error) =>
              log("main", `⚠️ Sync du lead non qualifié échouée : ${e.message}`),
            );
          }
          await hooks.onProgress?.(ok, target, `⚪ ${prefix} écarté après inspection : ${err.message} (${counters()})`);
          continue;
        }
        log("main", `✘ ${lead.name} : ${(err as Error).message}`);
        await hooks.onProgress?.(ok, target, `⚠️ Échec sur ${prefix} : ${(err as Error).message.slice(0, 100)}`);
      }
    }
    await hooks.onProgress?.(ok, target, `🎉 Scan terminé : ${ok}/${target} leads qualifiés synchronisés dans le CRM (${rejected} écarté(s) après inspection, ${potentialCount} potentiels repérés sur la zone)`);
    log("main", `Terminé : ${ok}/${target} leads qualifiés, ${rejected} écarté(s)`);
    return { processed: ok, total: target, cancelled: false };
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
  const id = leadId(lead.name, lead.phone ?? lead.mapsUrl);
  const def = getOpportunityOrDefault(opportunityType);
  log("lead", `→ ${lead.name} (${id}) [${def.id}]`);
  const dossier = await runLeadWorkflow(
    { def, lead, leadId: id, demoUrl: `${remoteAppUrl}/demos/${id}` },
    { mode: "full", context, remoteAppUrl, router, onSubStep },
  );
  return buildSyncPayload(dossier);
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
