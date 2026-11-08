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
    });
  }

  return leads.length > 0 ? leads : null;
}
