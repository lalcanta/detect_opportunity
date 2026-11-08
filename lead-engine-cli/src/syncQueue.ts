import { readdir, readFile, rename, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { loadConfig } from "./config";
import { pushLead } from "./sync/pushLead";
import { log, stripCodeFences } from "./utils/helpers";
import type { Battlecard, SyncPayload } from "./types";

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

      const coldEmail = rawBc.coldEmail || (rawBc.subject && rawBc.body ? { subject: rawBc.subject, body: rawBc.body } : undefined);

      const battlecard: Battlecard = {
        closerBrief: rawBc.closerBrief || rawBc.executiveSummary || rawBc.auditSummary,
        ourAdvantages: rawBc.ourAdvantages || rawBc.closingArguments || [
          "Barre d'appel d'urgence mobile collante en bas d'écran",
          "Mise en avant immédiate des avis Google et du vrai logo client",
          "Chargement ultra-rapide (< 0.5s) pensé pour convertir sur smartphone",
        ],
        callScript: rawBc.callScript || rawBc.openingPitch || "Bonjour, je vous contacte concernant votre site internet.",
        objections: (rawBc.objections || []).map((o) => ({
          objection: o.objection,
          reply: o.reply || o.response || "",
        })),
        whatsappText:
          rawBc.whatsappText ||
          `Bonjour ${meta.company_name}, voici la démo interactive de votre futur site web : ${cfg.REMOTE_APP_URL}/demos/${meta.id}`,
        coldEmail,
      };

      let flyerPdfBase64: string | null = null;
      if (existsSync(flyerPath)) {
        const flyerBuf = await readFile(flyerPath);
        flyerPdfBase64 = flyerBuf.toString("base64");
      }

      const summary = rawBc.auditSummary || rawBc.executiveSummary || "Audit de performance web & opportunité d'optimisation.";
      const weaknesses = rawBc.weaknesses || rawBc.currentSiteCritique || [
        "Site web existant lent à charger sur smartphone",
        "Absence de barre d'appel immédiate pour les urgences",
        "Avis clients Google non mis en valeur",
      ];

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
        opportunity_type: meta.opportunity_type || "website",
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
