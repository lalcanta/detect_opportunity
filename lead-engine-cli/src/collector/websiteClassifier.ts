/**
 * Le lien « site web » d'une fiche Google Maps n'est pas toujours le site du prospect : page Facebook ou Instagram
 * (parfois mal orthographiée, ex. instagra.com), annuaire (Pages Jaunes, Sessile…), plateforme de réservation ou de
 * livraison. Ces liens ne sont pas inspectés : le lead est traité comme « sans site ».
 */

/** Réseaux sociaux et raccourcis de liens, y compris les fautes de frappe courantes. */
const SOCIAL_HOST_RE =
  /(^|\.)(facebook|facebok|faceboook|fb|instagram|instagra|instagramm|instagr|linkedin|tiktok|youtube|youtu|twitter|x|pinterest|snapchat|threads|linktr|linktree|beacons|wa|whatsapp|m\.me)\.(com|me|ee|be|net|ai)$/i;

/** Annuaires, places de marché et plateformes qui hébergent une fiche, pas un site. */
const LISTING_HOSTS = [
  "pagesjaunes.fr", "sessile.fr", "interflora.fr", "tripadvisor.fr", "tripadvisor.com", "thefork.fr", "lafourchette.com",
  "ubereats.com", "deliveroo.fr", "just-eat.fr", "doctolib.fr", "planity.com", "treatwell.fr", "booking.com", "airbnb.fr",
  "airbnb.com", "leboncoin.fr", "houzz.fr", "habitatpresto.com", "travaux.com", "starofservice.com", "118712.fr",
  "justacote.com", "mappy.com", "societe.com", "pappers.fr", "maps.google.com", "google.com", "goo.gl", "g.page",
  "solocal.com", "annuaire-mairie.fr", "infobel.com", "hoodspot.fr", "cylex.fr", "kompass.com", "etsy.com",
];

export type WebsiteKind = "own" | "social" | "listing" | "invalid";

export function classifyWebsite(url: string | null | undefined): WebsiteKind {
  if (!url) return "invalid";
  let host: string;
  try {
    host = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "invalid";
  }
  if (SOCIAL_HOST_RE.test(host)) return "social";
  // Sites Google et sites gratuits de fiche Google : un vrai site du prospect.
  if (host === "sites.google.com" || host.endsWith(".business.site")) return "own";
  if (LISTING_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return "listing";
  return "own";
}

/** Site propre au prospect, ou `null` (réseau social, annuaire, lien invalide). */
export function ownWebsiteOrNull(url: string | null | undefined): string | null {
  return classifyWebsite(url) === "own" ? (url as string) : null;
}
