import { createHash } from "node:crypto";
import type { MapsLead } from "../types";

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export function leadId(name: string, phoneOrUrl: string): string {
  return createHash("sha1").update(`${name}|${phoneOrUrl}`).digest("hex").slice(0, 16);
}

export function stripCodeFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:html|json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

/**
 * Extrait et parse proprement un objet ou tableau JSON depuis une réponse LLM
 * qui peut contenir du texte d'introduction/conclusion ou des balises markdown.
 */
export function extractJson<T = Record<string, unknown>>(raw: string, fallback?: T): T {
  if (!raw || typeof raw !== "string") {
    if (fallback !== undefined) return fallback;
    throw new Error("Réponse JSON vide reçue");
  }

  // 1. Essai direct après nettoyage des balises code fences
  const cleaned = stripCodeFences(raw);
  try {
    return JSON.parse(cleaned) as T;
  } catch {}

  // 2. Recherche du premier { et dernier }
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = cleaned.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate) as T;
    } catch {}

    // 3. Nettoyage des virgules orphelines avant } ou ] et caractères de contrôle
    const sanitized = candidate
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/[\x00-\x1F\x7F-\x9F]/g, (c) => (c === "\n" || c === "\r" || c === "\t" ? c : ""));
    try {
      return JSON.parse(sanitized) as T;
    } catch {}
  }

  const firstBracket = cleaned.indexOf("[");
  const lastBracket = cleaned.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    const candidate = cleaned.slice(firstBracket, lastBracket + 1);
    try {
      return JSON.parse(candidate) as T;
    } catch {}
  }

  if (fallback !== undefined) return fallback;
  throw new Error(`Impossible d'extraire un JSON valide : ${raw.slice(0, 150)}...`);
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function log(scope: string, msg: string): void {
  console.log(`[${new Date().toISOString().slice(11, 19)}] [${scope}] ${msg}`);
}

/**
 * Détecte si la requête est une liste de domaines / URLs (ex: "domains:digidop.fr, acme.com" ou "digidop.fr, studio-k.fr")
 * et la convertit directement en liste de MapsLead sans passer par Google Maps.
 */
export function parseDirectDomainLeads(query: string, city: string = "France"): MapsLead[] | null {
  const trimmed = query.trim();
  const hasPrefix = /^(domains|urls)\s*:/i.test(trimmed);
  const rawBody = trimmed.replace(/^(domains|urls)\s*:/i, "").trim();
  if (!rawBody) return null;

  const tokens = rawBody
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  if (tokens.length === 0) return null;

  const domainRegex = /^(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+)(?:\/.*)?$/;
  if (!hasPrefix && !tokens.every((t) => domainRegex.test(t))) {
    return null;
  }

  const leads: MapsLead[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    const m = token.match(domainRegex);
    if (!m?.[1]) continue;
    const domain = m[1].toLowerCase();
    if (seen.has(domain)) continue;
    seen.add(domain);

    const baseSlug = domain.split(".")[0] || domain;
    const companyName = baseSlug
      .split(/[-_]+/)
      .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : ""))
      .join(" ");

    const fullUrl = /^https?:\/\//i.test(token) ? token : `https://${domain}`;
    leads.push({
      name: companyName || domain,
      activity: "Agence / Digital",
      city: city || "France",
      phone: null,
      website: fullUrl,
      rating: null,
      reviewsCount: null,
      recentReviews: [],
      mapsUrl: fullUrl,
      placeId: null,
      noMapsListing: true,
    });
  }

  return leads.length > 0 ? leads : null;
}
