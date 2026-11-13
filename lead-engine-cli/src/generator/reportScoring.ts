import type { MapsLead, SiteInspection } from "../types";
import type { CompetitorPixels } from "../collector/competitorPixels";

export interface ScoreCriterion {
  id: string;
  label: string;
  max: number;
  /** null = non mesuré */
  earned: number | null;
}

export interface ScoreResult {
  score: number;
  /** Critères mesurés */
  criteria: ScoreCriterion[];
  /** Critères non mesurés, retirés du total */
  removed: ScoreCriterion[];
}

const GOOGLE_ADS = "Google Ads (Conversion AW-)";
const META_PIXEL = "Meta Ads (Facebook Pixel)";

function crit(id: string, label: string, max: number, earned: number | null): ScoreCriterion {
  return { id, label, max, earned };
}

function build(all: ScoreCriterion[]): ScoreResult {
  const criteria = all.filter((c) => c.earned !== null);
  const removed = all.filter((c) => c.earned === null);
  const max = criteria.reduce((s, c) => s + c.max, 0);
  const earned = criteria.reduce((s, c) => s + (c.earned ?? 0), 0);
  return { score: max > 0 ? Math.round((100 * earned) / max) : 0, criteria, removed };
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
}

function positionPoints(rank: number): number {
  if (rank <= 3) return 35;
  if (rank <= 5) return 25;
  if (rank <= 10) return 12;
  return 0;
}

function boolPoints(value: boolean | null | undefined, max: number): number | null {
  return value === null || value === undefined ? null : value ? max : 0;
}

function speedPoints(ms: number | null | undefined, max: number): number | null {
  return ms === null || ms === undefined ? null : ms <= 3000 ? max : 0;
}

export function visibilityScore(lead: MapsLead, inspection: SiteInspection | null): ScoreResult {
  const all: ScoreCriterion[] = [];
  const competitors = lead.competitors ?? [];
  // Sans fiche Maps, note, avis et fiche ne sont pas mesurés, et métier/ville sont de remplissage.
  const listing = !lead.noMapsListing;

  all.push(crit("position", "Position sur Google Maps", 35,
    typeof lead.mapsRank === "number" ? positionPoints(lead.mapsRank) : null));

  const avgRating = average(competitors.map((c) => c.rating).filter((v): v is number => typeof v === "number"));
  const avgReviews = average(competitors.map((c) => c.reviewsCount).filter((v): v is number => typeof v === "number"));
  let rating = 0;
  if (typeof lead.rating === "number") {
    if (avgRating !== null) {
      const t = (v: number) => Math.round(v * 10);
      rating = t(lead.rating) >= t(avgRating) ? 15 : t(lead.rating) >= t(avgRating) - 3 ? 8 : 0;
    }
    else rating = lead.rating >= 4.5 ? 15 : lead.rating >= 4.0 ? 8 : 0;
  }
  let reviews = 0;
  if (typeof lead.reviewsCount === "number") {
    if (avgReviews !== null) reviews = lead.reviewsCount >= avgReviews ? 15 : lead.reviewsCount >= avgReviews / 2 ? 8 : 0;
    else reviews = lead.reviewsCount >= 50 ? 15 : lead.reviewsCount >= 20 ? 8 : 0;
  }
  all.push(crit("rating", "Note Google", 15, listing ? rating : null));
  all.push(crit("reviews_count", "Nombre d'avis", 15, listing ? reviews : null));

  all.push(crit("listing_site", "Site relié à la fiche", 6, listing && lead.website ? 6 : null));
  all.push(crit("listing_category", "Catégorie de la fiche", 4, listing ? (lead.activity?.trim() ? 4 : 0) : null));

  if (!lead.website) {
    all.push(crit("site", "Site web", 25, 0));
  } else {
    const seo = inspection?.seo;
    const kw = seo && listing ? (seo.activityInTitleOrH1 ? 1 : 0) + (seo.cityInTitleOrH1 ? 1 : 0) : null;
    all.push(crit("site_keywords", "Métier et ville dans le titre", 7, kw === null ? null : kw === 2 ? 7 : kw === 1 ? 3 : 0));
    all.push(crit("site_description", "Description de la page", 3, seo ? (seo.metaDescription ? 3 : 0) : null));
    all.push(crit("site_phone", "Même téléphone que la fiche", 4, seo ? boolPoints(seo.phoneMatchesListing, 4) : null));
    all.push(crit("site_schema", "Données structurées d'entreprise locale", 3, seo ? (seo.hasLocalBusinessSchema ? 3 : 0) : null));
    all.push(crit("site_mobile", "Site adapté au mobile", 4, boolPoints(inspection?.isResponsive, 4)));
    all.push(crit("site_https", "Site sécurisé (HTTPS)", 2, boolPoints(inspection?.isHttps, 2)));
    all.push(crit("site_speed", "Vitesse de chargement", 2, speedPoints(inspection?.loadTimeMs, 2)));
  }
  return build(all);
}

export function acquisitionScore(inspection: SiteInspection | null, competitors: CompetitorPixels[]): ScoreResult {
  const all: ScoreCriterion[] = [];
  const i = inspection;
  const ads = i?.paidAdsDetected;
  const trackers = i?.trackersFound;

  all.push(crit("google_ads", "Suivi des conversions Google Ads", 15, ads ? (ads.includes(GOOGLE_ADS) ? 15 : 0) : null));
  all.push(crit("meta_pixel", "Pixel Meta", 10, ads ? (ads.includes(META_PIXEL) ? 10 : 0) : null));
  all.push(crit("analytics", "Mesure d'audience", 10, trackers
    ? (trackers.some((t) => /analytics|tag manager|gtag/i.test(t)) ? 10 : 0) : null));
  all.push(crit("consent", "Bandeau de consentement", 5,
    !i || i.cmpDetected === undefined ? null : i.cmpDetected ? 5 : 0));

  all.push(crit("tel_link", "Numéro cliquable sur mobile", 12, i?.seo ? (i.seo.hasTelLink ? 12 : 0) : null));
  all.push(crit("contact_form", "Formulaire de contact", 10,
    !i || i.contactForm === undefined ? null : i.contactForm ? 10 : 0));
  all.push(crit("landing_mobile", "Page adaptée au mobile", 10, boolPoints(i?.isResponsive, 10)));
  all.push(crit("landing_speed", "Vitesse de la page", 8, speedPoints(i?.loadTimeMs, 8)));

  const verified = competitors.filter((c) => c.pixels !== null);
  let comparison: number | null = null;
  if (verified.length > 0 && ads) {
    const m = average(verified.map((c) => (c.pixels ?? []).length)) ?? 0;
    const n = ads.length;
    comparison = n >= m ? 20 : n > 0 ? 10 : 0;
  }
  all.push(crit("competitors", "Comparaison avec les concurrents", 20, comparison));
  return build(all);
}

const ACTIONS: Record<string, string> = {
  position: "Remonter dans les résultats Google Maps de la recherche",
  rating: "Améliorer la note Google en répondant aux avis et en sollicitant les clients satisfaits",
  reviews_count: "Collecter davantage d'avis Google auprès des clients",
  listing_site: "Relier le site web à la fiche Google",
  listing_category: "Renseigner la catégorie principale de la fiche Google",
  site: "Mettre en place un site web relié à la fiche Google",
  site_keywords: "Mettre le métier et la ville dans le titre de la page d'accueil",
  site_description: "Ajouter une description (meta) à la page d'accueil",
  site_phone: "Afficher sur le site le même téléphone que la fiche Google",
  site_schema: "Ajouter les données structurées d'entreprise locale au site",
  site_mobile: "Rendre le site lisible sur mobile",
  site_https: "Passer le site en HTTPS",
  site_speed: "Accélérer le chargement du site",
  google_ads: "Installer le suivi des conversions Google Ads",
  meta_pixel: "Installer le pixel Meta pour mesurer les visiteurs venus des réseaux sociaux",
  analytics: "Installer un outil de mesure d'audience",
  consent: "Ajouter un bandeau de consentement aux cookies",
  tel_link: "Rendre le numéro de téléphone cliquable sur mobile",
  contact_form: "Ajouter un formulaire de contact sur le site",
  landing_mobile: "Rendre la page d'arrivée lisible sur mobile",
  landing_speed: "Accélérer le chargement de la page d'arrivée",
  competitors: "Mettre en place le suivi publicitaire que les concurrents utilisent déjà",
};

export function scoreActions(result: ScoreResult, max = 3): string[] {
  return result.criteria
    .map((c, index) => ({ c, index, loss: c.earned === null ? 0 : c.max - c.earned }))
    .filter((x) => x.loss > 0 && ACTIONS[x.c.id])
    .sort((a, b) => b.loss - a.loss || a.index - b.index)
    .slice(0, max)
    .map((x) => ACTIONS[x.c.id] as string);
}
