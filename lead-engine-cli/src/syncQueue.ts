import { PITCH_KIND_BY_GENERATOR, getOpportunityOrDefault, isChannelId, opportunityIdOf, pitchGeneratorFor } from "../../shared/opportunities";
import { readdir, readFile, rename, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { loadConfig } from "./config";
import { pushLead } from "./sync/pushLead";
import { log, stripCodeFences } from "./utils/helpers";
import type { Battlecard, LeadContact, SyncPayload } from "./types";

interface RawBattlecardFile {
  closerBrief?: string;
  ourAdvantages?: string[];
  closingArguments?: string[];
  callScript?: string;
  openingPitch?: string;
  objections?: { objection: string; reply?: string; response?: string }[];
  whatsappText?: string;
  executiveSummary?: string;
  auditSummary?: string;
  currentSiteCritique?: string[];
  weaknesses?: string[];
  subject?: string;
  body?: string;
  coldEmail?: {
    subject: string;
    body: string;
  };
}

interface AuditFactsFile {
  auditSummary?: string;
  weaknesses?: string[];
}

interface QueueMeta {
  id: string;
  company_name: string;
  opportunity_type?: string;
  /** Canal principal calculé par prep (phone | email | contact_form) */
  primary_channel?: string | null;
  contacts?: LeadContact[];
}

export const MANIFEST_PATH = "queue/pending_manifest.json";

/**
 * Assemble la battlecard et les constats d'audit d'un lead de la file à partir des fichiers écrits par l'agent.
 * Renvoie `waiting` tant que l'agent n'a pas produit le contenu indispensable (cold email pour l'audit QA).
 */
export function buildQueueBattlecard(
  meta: QueueMeta,
  rawBc: RawBattlecardFile,
  facts: AuditFactsFile | null,
  appUrl: string,
): { waiting: string } | { battlecard: Battlecard; summary: string; weaknesses: string[] } {
  // Canal principal écrit (email ou formulaire) : le message est indispensable, le lead attend tant que l'agent ne l'a pas écrit.
  const def = getOpportunityOrDefault(meta.opportunity_type);
  const primaryChannel = isChannelId(meta.primary_channel) ? meta.primary_channel : null;
  const isColdEmail = PITCH_KIND_BY_GENERATOR[pitchGeneratorFor(def, primaryChannel)] === "cold_email";
  const isTrackerReport = def.proof.generator === "tracker_report";
  const coldEmail = rawBc.coldEmail || (rawBc.subject && rawBc.body ? { subject: rawBc.subject, body: rawBc.body } : undefined);
  if (isColdEmail && !coldEmail) return { waiting: "coldEmail absent de battlecard.json (message écrit attendu)" };

  const demoUrl = `${appUrl}/demos/${meta.id}`;
  const battlecard: Battlecard = isColdEmail
    ? {
        closerBrief: rawBc.closerBrief || rawBc.executiveSummary || rawBc.auditSummary || facts?.auditSummary,
        ourAdvantages:
          rawBc.ourAdvantages ||
          rawBc.closingArguments ||
          (isTrackerReport
            ? [
                "Rapport technique en accès libre, preuve réseau à l'appui",
                "Surveillance continue en CI/CD headless de tous les sites du portfolio",
                "Alerte dès qu'une CMP saute ou qu'un nouveau tag fuit sans consentement",
              ]
            : []),
        callScript: rawBc.callScript || (isTrackerReport ? "Opportunité 100% asynchrone par email (aucun appel téléphonique)." : ""),
        objections: (rawBc.objections || []).map((o) => ({ objection: o.objection, reply: o.reply || o.response || "" })),
        whatsappText: rawBc.whatsappText || "",
        coldEmail,
      }
    : {
        closerBrief: rawBc.closerBrief || rawBc.executiveSummary || rawBc.auditSummary,
        ourAdvantages: rawBc.ourAdvantages || rawBc.closingArguments || [
          "Barre d'appel d'urgence mobile collante en bas d'écran",
          "Mise en avant immédiate des avis Google et du vrai logo client",
          "Chargement ultra-rapide (< 0.5s) pensé pour convertir sur smartphone",
        ],
        callScript: rawBc.callScript || rawBc.openingPitch || "Bonjour, je vous contacte concernant votre site internet.",
        objections: (rawBc.objections || []).map((o) => ({ objection: o.objection, reply: o.reply || o.response || "" })),
        whatsappText: rawBc.whatsappText || `Bonjour ${meta.company_name}, voici la démo interactive de votre futur site web : ${demoUrl}`,
        coldEmail,
      };

  const summary =
    rawBc.auditSummary || rawBc.executiveSummary || facts?.auditSummary || "Audit de performance web & opportunité d'optimisation.";
  const weaknesses =
    rawBc.weaknesses ||
    rawBc.currentSiteCritique ||
    facts?.weaknesses ||
    (isColdEmail
      ? []
      : ["Site web existant lent à charger sur smartphone", "Absence de barre d'appel immédiate pour les urgences", "Avis clients Google non mis en valeur"]);

  return { battlecard, summary, weaknesses };
}

/** Retire du manifeste les leads dont le dossier n'est plus dans queue/pending (synchronisés ou supprimés). */
export async function pruneManifest(manifestPath = MANIFEST_PATH): Promise<void> {
  if (!existsSync(manifestPath)) return;
  try {
    const list = JSON.parse(await readFile(manifestPath, "utf-8"));
    if (!Array.isArray(list)) return;
    const kept = list.filter((p: { dir?: string }) => typeof p?.dir === "string" && existsSync(p.dir));
    if (kept.length !== list.length) await writeFile(manifestPath, JSON.stringify(kept, null, 2));
  } catch (err) {
    log("sync-queue", `⚠️ Manifeste illisible, non purgé : ${(err as Error).message}`);
  }
}

export async function syncQueue(): Promise<void> {
  const cfg = loadConfig();
  const pendingDir = "queue/pending";
  const completedDir = "queue/completed";

  if (!existsSync(pendingDir)) {
    console.log("Aucun dossier queue/pending trouvé. Lancez d'abord npm run prep.");
    return;
  }

  await mkdir(completedDir, { recursive: true });

  const entries = await readdir(pendingDir, { withFileTypes: true });
  const leadDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  if (leadDirs.length === 0) {
    await pruneManifest();
    console.log("Aucun prospect en attente dans queue/pending/.");
    return;
  }

  log("sync-queue", `Analyse de ${leadDirs.length} dossier(s) dans queue/pending/`);

  let syncedCount = 0;
  let waitingCount = 0;

  for (const id of leadDirs) {
    const dir = `${pendingDir}/${id}`;
    const metaPath = `${dir}/meta.json`;
    const demoPath = `${dir}/demo.html`;
    const battlecardPath = `${dir}/battlecard.json`;
    const flyerPath = `${dir}/flyer.pdf`;

    if (!existsSync(metaPath)) {
      log("sync-queue", `[SKIP] ${id} : meta.json manquant`);
      continue;
    }

    const hasDemo = existsSync(demoPath);
    const hasBattlecard = existsSync(battlecardPath);

    if (!hasDemo || !hasBattlecard) {
      const missing = [];
      if (!hasDemo) missing.push("demo.html");
      if (!hasBattlecard) missing.push("battlecard.json");
      log("sync-queue", `⏳ ${id} : en attente de génération (${missing.join(", ")})`);
      waitingCount++;
      continue;
    }

    try {
      const meta = JSON.parse(await readFile(metaPath, "utf-8"));
      const demoHtml = await readFile(demoPath, "utf-8");
      const battlecardRaw = await readFile(battlecardPath, "utf-8");
      const rawBc = JSON.parse(stripCodeFences(battlecardRaw)) as RawBattlecardFile;

      const factsPath = `${dir}/audit_facts.json`;
      const facts = existsSync(factsPath) ? (JSON.parse(await readFile(factsPath, "utf-8")) as AuditFactsFile) : null;
      const built = buildQueueBattlecard(meta, rawBc, facts, cfg.REMOTE_APP_URL);
      if ("waiting" in built) {
        log("sync-queue", `⏳ ${id} : en attente de génération (${built.waiting})`);
        waitingCount++;
        continue;
      }
      const { battlecard, summary, weaknesses } = built;

      let flyerPdfBase64: string | null = null;
      if (existsSync(flyerPath)) {
        const flyerBuf = await readFile(flyerPath);
        flyerPdfBase64 = flyerBuf.toString("base64");
      }

      const payload: SyncPayload = {
        id: meta.id,
        company_name: meta.company_name,
        activity: meta.activity,
        city: meta.city,
        phone: meta.phone,
        email: meta.email || (Array.isArray(meta.emails) && meta.emails[0]) || null,
        website_url: meta.website_url,
        google_rating: meta.google_rating,
        google_reviews_count: meta.google_reviews_count,
        opportunity_type: opportunityIdOf(meta.opportunity_type),
        primary_channel: meta.primary_channel ?? null,
        scanned_at: typeof meta.preparedAt === "string" ? meta.preparedAt : undefined,
        contacts: Array.isArray(meta.contacts) ? meta.contacts : undefined,
        audit_data: {
          score: meta.loadTimeMs && meta.loadTimeMs > 4000 ? 35 : 45,
          summary,
          weaknesses,
          recommendations: [
            "Site moderne Tailwind ultra-rapide optimisé pour mobile",
            "Bouton d'urgence cliquable direct avec sticky call bar",
            "Mise en valeur des avis Google 5 étoiles et devis express",
          ],
          loadTimeMs: meta.loadTimeMs,
          isResponsive: meta.isResponsive,
          dominantColors: meta.dominantColors || [],
          recentReviews: meta.recentReviews || [],
          mapsUrl: meta.mapsUrl,
          emails: meta.emails || [],
          key_people: meta.key_people || [],
          stack: meta.stack || [],
          site_images: Array.isArray(meta.site_images) ? meta.site_images : [],
          trackers_found: meta.trackers_found || [],
          tracker_requests: meta.tracker_requests || [],
          cmp_detected: meta.cmp_detected || null,
          social_links: meta.social_links || { linkedin: [], facebook: [], instagram: [] },
          siren: meta.siren || null,
          company_created_at: meta.company_created_at || null,
          report_url: `${cfg.REMOTE_APP_URL}/demos/${meta.id}`,
        },
        demo_html: demoHtml,
        flyer_pdf_base64: flyerPdfBase64,
        battlecard_data: battlecard,
        token_usage: [], // 0 external API cost (Généré par Antigravity CLI)
      };

      log("sync-queue", `☁️ Envoi de ${meta.company_name} vers ${cfg.REMOTE_APP_URL}...`);
      await pushLead(cfg.REMOTE_APP_URL, cfg.SYNC_SECRET_TOKEN, payload);

      // Déplacement dans queue/completed
      const destDir = `${completedDir}/${id}`;
      if (existsSync(destDir)) {
        await rename(dir, `${destDir}_${Date.now()}`);
      } else {
        await rename(dir, destDir);
      }

      syncedCount++;
      log("sync-queue", `✔ ${meta.company_name} synchronisé et déplacé dans completed/`);
    } catch (err) {
      log("sync-queue", `✘ Erreur synchronisation ${id} : ${(err as Error).message}`);
    }
  }

  await pruneManifest();

  console.log(`\n========================================================`);
  console.log(`🎉 Rapport de synchronisation :`);
  console.log(`- Synchronisés avec succès dans le CRM : ${syncedCount}`);
  console.log(`- En attente de génération par Antigravity : ${waitingCount}`);
  console.log(`========================================================\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  syncQueue().catch((err) => {
    console.error("Erreur syncQueue :", err);
    process.exit(1);
  });
}
