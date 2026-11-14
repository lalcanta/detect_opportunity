import type { ScanModule } from "./types";

const GOOGLE_ADS = "Google Ads (Conversion AW-)";
const GOOGLE_ADS_HTML = /\bAW-\d{6,12}\b|\bgoogle_conversion_id\s*=\s*\d{6,12}|googleadservices\.com\/pagead\/conversion/;
const GOOGLE_ADS_REQUEST = /googleadservices\.com\/pagead\/conversion\/\d+|googleads\.g\.doubleclick\.net\/pagead\/viewthroughconversion\/\d+|\bAW-\d{6,12}\b/;

const PAID_ADS_PATTERNS: { label: string; regex: RegExp }[] = [
  // Google Ads est prouvé par un identifiant AW-, par l'ancienne balise (google_conversion_id, conversion.js de
  // googleadservices) ou, côté réseau, par une requête de conversion. AdSense (googlesyndication) et DoubleClick
  // (Floodlight, Campaign Manager) ne le prouvent pas.
  { label: GOOGLE_ADS, regex: GOOGLE_ADS_HTML },
  { label: "Meta Ads (Facebook Pixel)", regex: /connect\.facebook\.net\/.*\/fbevents\.js|\bfbq\s*\(\s*['"]init['"]/i },
  { label: "TikTok Ads Pixel", regex: /analytics\.tiktok\.com|\bttq\.load\b/i },
  { label: "LinkedIn Insight Tag", regex: /snap\.licdn\.com\/li\.lms-analytics|\b_linkedin_partner_id\b/i },
  { label: "Microsoft Advertising (Bing UET)", regex: /bat\.bing\.com\/bat\.js|\buetq\b/i },
];

/** Détection pure depuis le HTML (sans trackers réseau). */
export function detectPaidAdsInHtml(html: string): string[] {
  return PAID_ADS_PATTERNS.filter((p) => p.regex.test(html)).map((p) => p.label);
}

/**
 * Pixels du HTML, complétés par les traceurs réseau. Google Ads ne vient que d'une preuve de conversion (HTML ou URL d'une
 * requête interceptée) : le traceur « Google Ads / DoubleClick » seul ne suffit pas.
 */
export function detectPaidAdsFromHtml(html: string, trackerNames: string[] = [], trackerUrls: string[] = []): string[] {
  const found = new Set<string>(detectPaidAdsInHtml(html));
  if (trackerUrls.some((u) => GOOGLE_ADS_REQUEST.test(u))) found.add(GOOGLE_ADS);
  for (const t of trackerNames) {
    if (/meta pixel|facebook/i.test(t)) found.add("Meta Ads (Facebook Pixel)");
    if (/tiktok/i.test(t)) found.add("TikTok Ads Pixel");
    if (/linkedin/i.test(t)) found.add("LinkedIn Insight Tag");
  }
  return [...found];
}

export const adsPixelSpyModule: ScanModule = {
  id: "ads_pixel_spy",
  label: "Espion Publicitaire (Google Ads / Meta Pixel)",
  description: "Détecte si le prospect achète déjà du trafic payant (Google Ads AW-, Meta Pixel, TikTok, LinkedIn).",
  async afterNavigate(ctx) {
    const html = await ctx.page.content().catch(() => "");
    const existingTrackers = ctx.result.trackersFound ?? [];
    const trackerUrls = (ctx.result.trackerRequests ?? []).map((r) => r.url);
    ctx.result.paidAdsDetected = detectPaidAdsFromHtml(html, existingTrackers, trackerUrls);
  },
};
