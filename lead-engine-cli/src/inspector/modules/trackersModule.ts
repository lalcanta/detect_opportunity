import type { HtmlTagIds, TrackerRequest } from "../../types";
import type { ScanModule } from "./types";

interface TrackerSignature {
  name: string;
  category: TrackerRequest["category"];
  pattern: RegExp;
}

export const TRACKER_SIGNATURES: TrackerSignature[] = [
  { name: "Google Analytics (GA4)", category: "analytics", pattern: /google-analytics\.com\/(g\/)?collect|analytics\.google\.com\/(g\/)?collect|googletagmanager\.com\/gtag\/js/i },
  { name: "Google Tag Manager", category: "tag_manager", pattern: /googletagmanager\.com\/gtm\.js/i },
  { name: "Google Ads / DoubleClick", category: "advertising", pattern: /googleads\.g\.doubleclick\.net|googleadservices\.com\/pagead|stats\.g\.doubleclick\.net/i },
  { name: "Meta / Facebook Pixel", category: "advertising", pattern: /connect\.facebook\.net.*\/fbevents\.js|facebook\.com\/tr(\?|$)/i },
  { name: "Hotjar Behavior Analytics", category: "heatmap_ux", pattern: /(static|script|vars|in)\.hotjar\.com/i },
  { name: "Microsoft Clarity", category: "heatmap_ux", pattern: /clarity\.ms\/(tag|s|collect)/i },
  { name: "LinkedIn Insight Tag", category: "advertising", pattern: /snap\.licdn\.com|px\.ads\.linkedin\.com/i },
  { name: "TikTok Pixel", category: "advertising", pattern: /analytics\.tiktok\.com/i },
  { name: "HubSpot Tracking", category: "chat_crm", pattern: /js\.hs-analytics\.net|js\.hs-scripts\.com|track\.hubspot\.com/i },
  { name: "Criteo Retargeting", category: "advertising", pattern: /(static|gum)\.criteo\.(net|com)/i },
  { name: "Intercom Messenger", category: "chat_crm", pattern: /widget\.intercom\.io|js\.intercomcdn\.com/i },
  { name: "Crisp Chat", category: "chat_crm", pattern: /client\.crisp\.chat/i },
  { name: "Mixpanel Analytics", category: "analytics", pattern: /cdn\.mxpnl\.com|api(-js)?\.mixpanel\.com/i },
  { name: "Segment Analytics", category: "analytics", pattern: /cdn\.segment\.com|api\.segment\.io/i },
];

/** Identifie si une requête réseau correspond à un traceur tiers déclenché avant consentement. */
export function classifyTrackerUrl(reqUrl: string): TrackerRequest | null {
  for (const sig of TRACKER_SIGNATURES) {
    if (sig.pattern.test(reqUrl)) {
      return {
        name: sig.name,
        category: sig.category,
        url: reqUrl.length > 140 ? reqUrl.slice(0, 137) + "..." : reqUrl,
      };
    }
  }
  return null;
}

/** Détecte la CMP présente dans le code HTML d'une page. */
export function detectCmpFromHtml(html: string): string | null {
  if (/axeptio|axept\.io/i.test(html)) return "Axeptio";
  if (/didomi/i.test(html)) return "Didomi";
  if (/cookiebot/i.test(html)) return "Cookiebot";
  if (/onetrust|cookielaw\.org/i.test(html)) return "OneTrust";
  if (/tarteaucitron/i.test(html)) return "Tarteaucitron";
  if (/complianz/i.test(html)) return "Complianz";
  if (/iubenda/i.test(html)) return "Iubenda";
  if (/sirdata/i.test(html)) return "Sirdata";
  return null;
}

const uniq = (values: string[]) => [...new Set(values)].slice(0, 5);
const all = (html: string, re: RegExp, group = 0) => [...html.matchAll(re)].map((m) => m[group] ?? "").filter(Boolean);

/** Identifiants de balises écrits dans le HTML (au plus 5 par famille) : seule trace des outils retardés par un bandeau. */
export function detectTagIdsInHtml(html: string): HtmlTagIds {
  return {
    analytics: uniq([...all(html, /\bG-[A-Z0-9]{6,12}\b/g), ...all(html, /\bUA-\d{4,10}-\d{1,4}\b/g), ...all(html, /\bGTM-[A-Z0-9]{4,10}\b/g)]),
    googleAds: uniq([...all(html, /\bAW-\d{6,12}\b/g), ...all(html, /\bgoogle_conversion_id\s*=\s*(\d{6,12})/g, 1).map((n) => `AW-${n}`)]),
    metaPixel: uniq([
      ...all(html, /fbq\s*\(\s*['"]init['"]\s*,\s*['"]?(\d{10,20})/g, 1),
      ...all(html, /facebook\.com\/tr\/?\?(?:[^"'\s>]*&(?:amp;)?)?id=(\d{10,20})/g, 1),
    ]),
  };
}

export const trackersModule: ScanModule = {
  id: "trackers_cmp",
  label: "Traceurs Réseau & CMP (RGPD)",
  description: "Intercepte les requêtes réseau des traceurs déclenchés à froid avant consentement et identifie la CMP.",
  beforeNavigate({ page, result }) {
    const trackerMap = new Map<string, TrackerRequest>();
    page.on("request", (req) => {
      const hit = classifyTrackerUrl(req.url());
      if (hit && !trackerMap.has(hit.name)) {
        trackerMap.set(hit.name, hit);
        result.trackerRequests = [...trackerMap.values()];
        result.trackersFound = result.trackerRequests.map((t) => t.name);
      }
    });
  },
  async afterNavigate({ page, result }) {
    // Laisser un court délai aux conteneurs GTM asynchrones pour déclencher leurs tags à froid
    await page.waitForTimeout(800);
    const html = await page.evaluate(() => document.documentElement.outerHTML);
    result.cmpDetected = detectCmpFromHtml(html);
    result.htmlTagIds = detectTagIdsInHtml(html);
  },
};
