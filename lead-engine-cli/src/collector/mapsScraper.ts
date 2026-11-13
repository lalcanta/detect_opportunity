import { fetchPlacesReviews, placesReviewsEnabled } from "./placesReviews";
import { describeRejection, evaluateRequirements, getOpportunityOrDefault } from "../../../shared/opportunities";
import { ownWebsiteOrNull } from "./websiteClassifier";
import type { BrowserContext, Page } from "playwright";
import type { MapsCompetitor, MapsLead, Review } from "../types";
import { log } from "../utils/helpers";
import { pickCompetitors, searchLabel } from "./mapsRanking";

export interface ScrapeOptions {
  query: string;
  city: string;
  limit: number;
  lat?: number | null;
  lng?: number | null;
  radius_km?: number | null;
  context: BrowserContext;
  /** true en mode CDP : un humain peut résoudre un captcha dans la fenêtre visible */
  interactive: boolean;
  /** Opportunité ciblée (shared/opportunities) : ses prérequis filtrent les fiches */
  opportunityType?: string;
  /** Filtre sur la présence de site web : all, no_website, has_website */
  websiteFilter?: "all" | "no_website" | "has_website";
  /** Callback optionnel de progression */
  onProgress?: (message: string, qualifiedCount?: number, potentialCount?: number) => Promise<boolean | void> | boolean | void;
}

export interface ScrapeResult {
  qualifiedLeads: MapsLead[];
  potentialCount: number;
}

class CaptchaError extends Error {}

export async function scrapeMaps(opts: ScrapeOptions): Promise<ScrapeResult> {
  const page = await opts.context.newPage();
  try {
    const subQueries = opts.query
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (subQueries.length === 0) subQueries.push("artisans");

    const targetQualified = opts.limit;
    const def = getOpportunityOrDefault(opts.opportunityType);
    // On collecte un vivier suffisant de candidats pour garantir d'atteindre l'objectif de prospects qualifiés
    const targetCandidates = Math.max(targetQualified * 3, 60);

    const allUrls = new Set<string>();
    // Rang affiché par sous-requête : la première sous-requête qui voit une URL fixe son rang.
    const placeSeen = new Map<string, { subQuery: string; rank: number }>();
    const zoom = Math.max(10, Math.min(17, Math.round(16 - Math.log2((opts.radius_km || 5) * 1.5))));

    for (let qIdx = 0; qIdx < subQueries.length; qIdx++) {
      const sq = subQueries[qIdx];
      if (!sq) continue;
      if (allUrls.size >= targetCandidates) break;
      await opts.onProgress?.(`Recherche Maps (${qIdx + 1}/${subQueries.length}) : ciblage "${sq}"... (0/${targetQualified} qualifiés · ${allUrls.size} potentiels repérés)`, 0, allUrls.size);
      const targetUrl =
        opts.lat != null && opts.lng != null
          ? `https://www.google.com/maps/search/${encodeURIComponent(sq)}/@${opts.lat},${opts.lng},${zoom}z?hl=fr`
          : `https://www.google.com/maps/search/${encodeURIComponent(`${sq} ${opts.city}`)}?hl=fr`;

      log("maps", `Navigation vers : ${targetUrl}`);
      await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
      await acceptConsent(page);
      await guardCaptcha(page, opts.interactive);

      const remainingCandidates = targetCandidates - allUrls.size;
      const urls = await collectPlaceUrls(page, remainingCandidates, opts.interactive);
      urls.forEach((u, i) => {
        allUrls.add(u);
        if (!placeSeen.has(u)) placeSeen.set(u, { subQuery: sq, rank: i + 1 });
      });
      await opts.onProgress?.(`Collecte Maps : ${allUrls.size} potentiels repérés sur la zone (objectif : ${targetQualified} qualifiés)...`, 0, allUrls.size);
    }

    const potentialCount = allUrls.size;
    log("maps", `${potentialCount} fiches potentielles repérées sur la zone`);
    await opts.onProgress?.(`Extraction détaillée des fiches Maps (${potentialCount} potentiels repérés sur la zone, objectif : ${targetQualified} qualifiés)...`, 0, potentialCount);

    const qualifiedLeads: MapsLead[] = [];
    const fromCoords = opts.lat != null && opts.lng != null;
    // Fiches déjà ouvertes, par sous-requête (aucune navigation en plus)
    const openedBySubQuery = new Map<string, MapsCompetitor[]>();
    const leadSource = new Map<MapsLead, { subQuery: string; rank: number }>();
    let pIdx = 0;
    for (const url of allUrls) {
      if (qualifiedLeads.length >= targetQualified) {
        log("maps", `Objectif de ${targetQualified} leads qualifiés atteint !`);
        break;
      }
      pIdx++;
      await opts.onProgress?.(
        `[Analyse fiche Maps ${pIdx}/${potentialCount}] Recherche coordonnées... (${qualifiedLeads.length}/${targetQualified} qualifiés validés · ${potentialCount} potentiels repérés)`,
        qualifiedLeads.length,
        potentialCount,
      );
      try {
        const lead = await scrapePlace(page, url, opts);
        if (lead) {
          const seen = placeSeen.get(url);
          if (seen) {
            const opened = openedBySubQuery.get(seen.subQuery) ?? [];
            opened.push({
              name: lead.name,
              rank: seen.rank,
              rating: lead.rating,
              reviewsCount: lead.reviewsCount,
              website: lead.website,
              category: lead.activity,
            });
            openedBySubQuery.set(seen.subQuery, opened);
          }
          // Prérequis de l'opportunité connus sur la fiche (téléphone, site) ; email et formulaire seront vérifiés après inspection.
          const check = evaluateRequirements(
            def,
            { phone: Boolean(lead.phone), website: Boolean(lead.website), rating: lead.rating, reviewsCount: lead.reviewsCount },
            "maps",
          );
          if (!check.qualified) {
            await opts.onProgress?.(
              `⚪ Fiche écartée (${check.reasons.map(describeRejection).join(" ; ")}) : "${lead.name}" (${qualifiedLeads.length}/${targetQualified} qualifiés · ${pIdx}/${potentialCount} analysés sur ${potentialCount} potentiels repérés)`,
              qualifiedLeads.length,
              potentialCount,
            );
            continue;
          }

          // Filtre présence web : sans site ou avec site uniquement
          if (opts.websiteFilter === "no_website" && lead.website) {
            await opts.onProgress?.(
              `⚪ A déjà un site web (${lead.website}) ignoré par filtre "Sans site uniquement" : "${lead.name}"`,
              qualifiedLeads.length,
              potentialCount,
            );
            continue;
          }

          if (opts.websiteFilter === "has_website" && !lead.website) {
            await opts.onProgress?.(
              `⚪ Sans site web ignoré par filtre "Avec site web uniquement" : "${lead.name}"`,
              qualifiedLeads.length,
              potentialCount,
            );
            continue;
          }

          // Maps ne montre pas les avis sans compte connecté : complément par l'API Places si une clé est configurée.
          if (lead.recentReviews.length === 0 && placesReviewsEnabled()) {
            lead.recentReviews = await fetchPlacesReviews(lead.name, lead.city);
          }
          qualifiedLeads.push(lead);
          if (seen) leadSource.set(lead, seen);
          await opts.onProgress?.(
            `✔ Prospect retenu : "${lead.name}" (${lead.phone ? `📞 ${lead.phone}` : "📵 sans téléphone"}${lead.website ? " · 🌐 Site existant" : " · 🚫 Sans site"}) → ${qualifiedLeads.length}/${targetQualified} qualifiés (${pIdx}/${potentialCount} analysés sur ${potentialCount} potentiels repérés)`,
            qualifiedLeads.length,
            potentialCount,
          );
        }
      } catch (err) {
        if (err instanceof CaptchaError) throw err;
        log("maps", `Fiche ignorée (${(err as Error).message})`);
      }
    }
    const checkedAt = new Date().toISOString();
    for (const lead of qualifiedLeads) {
      const seen = leadSource.get(lead);
      if (!seen) continue;
      lead.mapsRank = seen.rank;
      lead.mapsQuery = searchLabel(seen.subQuery, opts.city, fromCoords);
      lead.mapsCheckedAt = checkedAt;
      lead.competitors = pickCompetitors(openedBySubQuery.get(seen.subQuery) ?? [], seen.rank);
    }
    return { qualifiedLeads, potentialCount };
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function acceptConsent(page: Page): Promise<void> {
  const btn = page.locator('button:has-text("Tout accepter"), button:has-text("Accept all")').first();
  if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) await btn.click().catch(() => undefined);
}

async function guardCaptcha(page: Page, interactive: boolean): Promise<void> {
  if (!page.url().includes("/sorry/")) return;
  if (!interactive) throw new CaptchaError("Captcha détecté en headless : relancez avec --cdp");
  log("maps", "⚠️  Captcha détecté : résolvez-le dans Chrome (5 min max)…");
  await page.waitForURL((u) => !u.href.includes("/sorry/"), { timeout: 300_000 });
}

async function collectPlaceUrls(page: Page, limit: number, interactive: boolean): Promise<string[]> {
  await page.waitForSelector('div[role="feed"], h1.DUwDvf', { timeout: 20_000 }).catch(() => undefined);
  const urls = new Set<string>();

  // Si Maps s'est ouvert directement sur la fiche unique d'un artisan
  if (page.url().includes("/maps/place/")) {
    urls.add(page.url());
    return [...urls];
  }

  let prevSize = 0;
  let unchangedCount = 0;

  for (let i = 0; i < 60 && urls.size < limit; i++) {
    await guardCaptcha(page, interactive);
    const hrefs = await page.$$eval("a.hfpxzc", (as) => as.map((a) => (a as HTMLAnchorElement).href));
    hrefs.forEach((h) => urls.add(h));
    if (urls.size >= limit) break;
    if (await page.locator("text=/Vous avez atteint la fin/").count()) break;

    if (urls.size === prevSize) {
      unchangedCount++;
      if (unchangedCount >= 4) break;
    } else {
      unchangedCount = 0;
      prevSize = urls.size;
    }

    await page.evaluate(() => {
      const feed = document.querySelector('div[role="feed"]');
      feed?.scrollBy(0, feed.scrollHeight);
    });
    await page.waitForTimeout(1000);
  }
  return [...urls].slice(0, limit);
}

async function scrapePlace(page: Page, url: string, opts: ScrapeOptions): Promise<MapsLead | null> {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await guardCaptcha(page, opts.interactive);
  await page.waitForSelector("h1.DUwDvf", { timeout: 15_000 });

  const text = async (sel: string): Promise<string | null> =>
    (await page.locator(sel).first().textContent({ timeout: 1500 }).catch(() => null))?.trim() || null;
  const attr = async (sel: string, name: string): Promise<string | null> =>
    page.locator(sel).first().getAttribute(name, { timeout: 1500 }).catch(() => null);

  const name = await text("h1.DUwDvf");
  if (!name) return null;

  const phoneId = await attr('button[data-item-id^="phone:tel"]', "data-item-id");
  const phone = phoneId ? phoneId.replace("phone:tel:", "") : null;
  const rawWebsite = await attr('a[data-item-id="authority"]', "href");
  // Page Facebook/Instagram ou fiche d'annuaire : ce n'est pas le site du prospect, il n'est pas inspecté.
  const website = ownWebsiteOrNull(rawWebsite);
  const listingUrl = rawWebsite && !website ? rawWebsite : null;
  const ratingRaw = await text('div.F7nice span[aria-hidden="true"]');
  const reviewsLabel = await attr('div.F7nice span[aria-label*="avis"]', "aria-label");
  const activity = (await text("button.DkEaL")) ?? opts.query;

  const addressRaw = await text('button[data-item-id="address"]');
  let realCity = opts.city;
  if (addressRaw) {
    const match = addressRaw.match(/\b\d{5}\s+([A-Za-zÀ-ÿ\s-]+)/);
    if (match && match[1]) realCity = match[1].trim();
  }

  const html = await page.content();
  const placeId = html.match(/ChIJ[\w-]{20,}/)?.[0] ?? null;

  const recentReviews = await scrapeRecentReviews(page);

  return {
    name,
    activity,
    city: realCity,
    phone,
    website,
    listingUrl,
    rating: ratingRaw ? Number(ratingRaw.replace(",", ".")) || null : null,
    reviewsCount: reviewsLabel ? Number(reviewsLabel.replace(/\D/g, "")) || null : null,
    recentReviews,
    mapsUrl: page.url(),
    placeId,
  };
}

async function scrapeRecentReviews(page: Page): Promise<Review[]> {
  try {
    await page.locator('button[role="tab"]:has-text("Avis")').first().click({ timeout: 3000 });
    await page.waitForSelector("div.jftiEf", { timeout: 6000 });
    // Tri "Les plus récents" : facultatif. S'il échoue, on garde les avis affichés par défaut (les plus pertinents).
    try {
      await page.locator('button[aria-label*="Trier"], button[data-value="Trier"]').first().click({ timeout: 2500 });
      await page.locator('div[role="menuitemradio"]:has-text("récents")').first().click({ timeout: 2500 });
      await page.waitForTimeout(1500);
    } catch {
      log("maps", "Tri des avis par date indisponible : avis par défaut conservés");
    }

    return await page.$$eval("div.jftiEf", (nodes) =>
      nodes.slice(0, 3).map((n) => {
        const stars = n.querySelector("span.kvMYJc")?.getAttribute("aria-label") ?? "";
        return {
          author: n.querySelector(".d4r55")?.textContent?.trim() ?? "Client Google",
          rating: Number(stars.replace(/\D/g, "").slice(0, 1)) || null,
          text: n.querySelector(".wiI7pd")?.textContent?.trim() ?? "",
          relativeDate: n.querySelector(".rsqaWe")?.textContent?.trim() ?? "",
        };
      }),
    ).then((rs) => rs.filter((r) => r.text.length > 0));
  } catch {
    return [];
  }
}
