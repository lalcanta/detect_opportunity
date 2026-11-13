import type { ScanModule } from "./types";

const PAID_ADS_PATTERNS: { label: string; regex: RegExp }[] = [
  { label: "Google Ads (Conversion AW-)", regex: /\bAW-\d{6,12}\b|googleads\.g\.doubleclick\.net|googlesyndication\.com|gtag\(\s*['"]config['"]\s*,\s*['"]AW-/i },
  { label: "Meta Ads (Facebook Pixel)", regex: /connect\.facebook\.net\/.*\/fbevents\.js|\bfbq\s*\(\s*['"]init['"]/i },
  { label: "TikTok Ads Pixel", regex: /analytics\.tiktok\.com|\bttq\.load\b/i },
  { label: "LinkedIn Insight Tag", regex: /snap\.licdn\.com\/li\.lms-analytics|\b_linkedin_partner_id\b/i },
  { label: "Microsoft Advertising (Bing UET)", regex: /bat\.bing\.com\/bat\.js|\buetq\b/i },
];

/** Détection pure depuis le HTML (sans trackers réseau). */
export function detectPaidAdsInHtml(html: string): string[] {
  return PAID_ADS_PATTERNS.filter((p) => p.regex.test(html)).map((p) => p.label);
}

export function detectPaidAdsFromHtml(html: string, trackerNames: string[] = []): string[] {
  const found = new Set<string>(detectPaidAdsInHtml(html));
  for (const t of trackerNames) {
    if (/google ads/i.test(t)) found.add("Google Ads (Conversion AW-)");
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
    ctx.result.paidAdsDetected = detectPaidAdsFromHtml(html, existingTrackers);
  },
};
