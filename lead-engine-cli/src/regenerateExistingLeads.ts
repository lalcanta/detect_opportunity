import { execSync } from "node:child_process";
import { loadConfig } from "./config";
import { ModelRouter } from "./llm/modelRouter";
import { generateDemoHtml, LOGO_PLACEHOLDER } from "./generator/demoGenerator";
import { pushLead } from "./sync/pushLead";
import type { MapsLead, SiteAudit, SiteInspection, TokenUsageRecord } from "./types";
import { log } from "./utils/helpers";

interface D1Lead {
  id: string;
  company_name: string;
  activity: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  website_url: string | null;
  google_rating: number | null;
  google_reviews_count: number | null;
  opportunity_type: string | null;
  status: string | null;
  audit_data: string | null;
  flyer_pdf_base64: string | null;
  battlecard_data: string | null;
}

async function main() {
  const cfg = loadConfig({ REMOTE_APP_URL: "https://lead-dashboard-8bx.pages.dev" });
  log("regen", `Configuration chargée : ${cfg.REMOTE_APP_URL}`);

  // Initialisation du ModelRouter configuré sur Cloudflare Workers AI 0€
  const router = new ModelRouter(cfg);
  router.updateSettings([
    { action_type: "demo", provider: "cloudflare", model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", thinking_budget: 0 }
  ]);

  log("regen", "Récupération des leads depuis la base Cloudflare D1 de production...");
  const rawJson = execSync(
    'npx --prefix ../lead-dashboard-web wrangler d1 execute lead-dashboard-db --remote --json --command="SELECT id, company_name, activity, city, phone, email, website_url, google_rating, google_reviews_count, opportunity_type, status, audit_data, flyer_pdf_base64, battlecard_data FROM leads;"',
    { maxBuffer: 50 * 1024 * 1024, encoding: "utf-8" }
  );

  const parsed = JSON.parse(rawJson);
  const leads: D1Lead[] = parsed[0]?.results ?? [];
  log("regen", `${leads.length} leads trouvés en production.`);

  for (let i = 0; i < leads.length; i++) {
    const l = leads[i];
    if (!l) continue;
    log("regen", `\n[${i + 1}/${leads.length}] Régénération de la démo pour "${l.company_name}" (${l.city || "N/A"})...`);

    let audit: SiteAudit = {
      score: 50,
      summary: "",
      weaknesses: [],
    };
    let logoUrl: string | null = null;
    let dominantColors: string[] = ["#1e3a8a", "#0284c7"];

    if (l.audit_data) {
      try {
        const parsedAudit = JSON.parse(l.audit_data);
        audit = {
          score: parsedAudit.score ?? 50,
          summary: parsedAudit.summary ?? "",
          weaknesses: parsedAudit.weaknesses ?? [],
        };
        if (parsedAudit.logoUrl) logoUrl = parsedAudit.logoUrl;
        if (parsedAudit.dominantColors && Array.isArray(parsedAudit.dominantColors)) {
          dominantColors = parsedAudit.dominantColors;
        }
      } catch {
        // Ignorer si json corrompu
      }
    }

    const inspection: SiteInspection = {
      url: l.website_url || "https://google.com",
      title: l.company_name,
      loadTimeMs: 1200,
      isResponsive: true,
      dominantColors,
      logoUrl,
      screenshot: null,
      socialLinks: { linkedin: [], facebook: [], instagram: [] },
    };

    const mapsLead: MapsLead = {
      name: l.company_name,
      activity: l.activity || "Artisan",
      city: l.city || "",
      phone: l.phone,
      website: l.website_url,
      rating: l.google_rating,
      reviewsCount: l.google_reviews_count,
      recentReviews: [],
      mapsUrl: "",
      placeId: null,
    };

    log("regen", `Logo réel détecté : ${logoUrl ? (logoUrl.startsWith("data:") ? "Oui (Image Base64 propre)" : logoUrl) : "Non (création typographique harmonieuse)"}`);

    const usage: TokenUsageRecord[] = [];
    const demoHtmlRaw = await generateDemoHtml(
      router,
      {
        leadId: l.id,
        lead: mapsLead,
        inspection,
        audit,
        remoteAppUrl: cfg.REMOTE_APP_URL,
      },
      usage
    );

    // Injection du logo dans le placeholder si besoin
    let finalDemoHtml = demoHtmlRaw;
    if (logoUrl && finalDemoHtml.includes(LOGO_PLACEHOLDER)) {
      finalDemoHtml = finalDemoHtml.replaceAll(LOGO_PLACEHOLDER, logoUrl);
    }

    log("regen", `Démo HTML générée avec succès (${finalDemoHtml.length} caractères).`);

    // Synchronisation vers le dashboard
    let battlecardData = undefined;
    if (l.battlecard_data) {
      try {
        battlecardData = JSON.parse(l.battlecard_data);
      } catch {}
    }

    await pushLead(cfg.REMOTE_APP_URL, cfg.SYNC_SECRET_TOKEN, {
      id: l.id,
      company_name: l.company_name,
      activity: l.activity || "Artisan",
      city: l.city || "France",
      phone: l.phone,
      email: l.email ?? undefined,
      website_url: l.website_url,
      google_rating: l.google_rating,
      google_reviews_count: l.google_reviews_count,
      opportunity_type: l.opportunity_type ?? "website",
      status: (l.status as any) || "demo_ready",
      audit_data: audit as unknown as Record<string, unknown>,
      demo_html: finalDemoHtml,
      flyer_pdf_base64: l.flyer_pdf_base64 ?? undefined,
      battlecard_data: battlecardData,
      token_usage: usage,
    });

    log("regen", `✔ Lead "${l.company_name}" mis à jour en production !`);
  }

  log("regen", "\n🎉 Toutes les démos ont été régénérées et publiées avec succès !");
}

main().catch((err) => {
  console.error("Erreur de régénération :", err);
  process.exit(1);
});
