import type { SeoOnPage } from "../../types";
import type { ScanModule } from "./types";

const LOCAL_BUSINESS_TYPES = new Set([
  "localbusiness", "plumber", "electrician", "hvacbusiness", "roofingcontractor", "locksmith",
  "housepainter", "generalcontractor", "movingcompany", "autorepair", "autodealer", "dentist",
  "physician", "medicalclinic", "beautysalon", "hairsalon", "daycare", "restaurant", "barorpub",
  "cafeorcoffeeshop", "bakery", "store", "legalservice", "accountingservice", "realestateagent",
  "professionalservice", "healthandbeautybusiness", "homeandconstructionbusiness",
  "foodestablishment", "lodgingbusiness", "sportsactivitylocation", "veterinarycare",
]);

const decode = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/** Un href mal encodé (`%E0%A4%A`) ne doit pas faire échouer l'analyse. */
function safeDecodeUri(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

const stripTags = (s: string) => decode(s.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

/** Minuscules sans accents, pour comparer sans tenir compte de la casse ni des accents. */
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const lastDigits = (s: string) => s.replace(/\D/g, "").slice(-9);

function collectTypes(node: unknown, out: string[]): void {
  if (Array.isArray(node)) return node.forEach((n) => collectTypes(n, out));
  if (!node || typeof node !== "object") return;
  for (const [key, value] of Object.entries(node)) {
    if (key === "@type") {
      for (const t of Array.isArray(value) ? value : [value]) if (typeof t === "string") out.push(t);
    } else collectTypes(value, out);
  }
}

function hasLocalBusinessSchema(html: string): boolean {
  const blocks = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const [, body] of blocks) {
    try {
      const types: string[] = [];
      collectTypes(JSON.parse((body ?? "").trim()), types);
      if (types.some((t) => LOCAL_BUSINESS_TYPES.has(fold(t.replace(/^.*[/#]/, ""))))) return true;
    } catch {
      /* JSON-LD invalide : ignoré */
    }
  }
  return false;
}

function metaDescription(html: string): string | null {
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    if (!/name=["']description["']/i.test(tag)) continue;
    const content = tag.match(/content=(?:"([^"]*)"|'([^']*)')/i);
    const value = decode((content?.[1] ?? content?.[2] ?? "").trim());
    if (value) return value;
  }
  return null;
}

function findPhones(html: string, telHrefs: string[]): string[] {
  const text = stripTags(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " "));
  const found = [...telHrefs, ...(text.match(/(?:\+33|0033|0)[\s.-]?[1-9](?:[\s.-]?\d{2}){4}/g) ?? [])];
  const seen = new Set<string>();
  const phones: string[] = [];
  for (const raw of found) {
    const key = lastDigits(raw);
    if (key.length < 9 || seen.has(key)) continue;
    seen.add(key);
    phones.push(raw.trim());
  }
  return phones.slice(0, 5);
}

/** Lit les signaux de référencement local d'une page, à partir de son HTML seul. */
export function analyzeSeoHtml(html: string, ctx: { activity: string; city: string; listingPhone: string | null }): SeoOnPage {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = titleMatch ? stripTags(titleMatch[1] ?? "") || null : null;
  const h1 = h1Match ? stripTags(h1Match[1] ?? "") || null : null;

  const telHrefs = [...html.matchAll(/href=["']tel:([^"']+)["']/gi)].map((m) => safeDecodeUri(m[1] ?? "").trim());
  const phones = findPhones(html, telHrefs);

  const heading = fold(`${title ?? ""} ${h1 ?? ""}`);
  const mentions = (term: string) => {
    const t = fold(term).trim();
    return t.length > 0 && heading.includes(t);
  };

  const listingKey = ctx.listingPhone ? lastDigits(ctx.listingPhone) : "";
  const phoneMatchesListing = listingKey.length >= 9 && phones.length > 0 ? phones.some((p) => lastDigits(p) === listingKey) : null;

  return {
    title,
    metaDescription: metaDescription(html),
    h1,
    hasLocalBusinessSchema: hasLocalBusinessSchema(html),
    phones,
    hasTelLink: telHrefs.length > 0,
    activityInTitleOrH1: mentions(ctx.activity),
    cityInTitleOrH1: mentions(ctx.city),
    phoneMatchesListing,
  };
}

export const seoOnPageModule: ScanModule = {
  id: "seo_onpage",
  label: "Référencement du site",
  description: "Lit le titre, la description, le H1, les données structurées et le téléphone de la page d'accueil.",
  async afterNavigate({ page, city, phone, activity, result }) {
    const html = await page.content();
    result.seo = analyzeSeoHtml(html, { activity: activity ?? "", city: city ?? "", listingPhone: phone ?? null });
  },
};
