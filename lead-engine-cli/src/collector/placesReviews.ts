/**
 * Avis Google via l'API Places (New), en complément du scraping Maps.
 * Maps n'affiche pas les avis aux sessions non connectées : sans cette API (ou le mode --cdp avec un Chrome connecté),
 * les démos n'ont que la note et le nombre d'avis.
 *
 * Optionnel et payant : actif seulement si GOOGLE_PLACES_API_KEY est défini (.env du CLI).
 * Appelé uniquement pour les prospects retenus, une requête par prospect.
 */
import type { Review } from "../types";
import { log } from "../utils/helpers";

const ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK = "places.displayName,places.rating,places.userRatingCount,places.reviews";

interface PlacesReview {
  rating?: number;
  text?: { text?: string };
  originalText?: { text?: string };
  relativePublishTimeDescription?: string;
  authorAttribution?: { displayName?: string };
}

/** Transforme la réponse de l'API en avis du CLI : avis avec texte uniquement, 3 au plus, les mieux notés d'abord. */
export function mapPlacesReviews(json: unknown, max = 3): Review[] {
  const place = (json as { places?: Array<{ reviews?: PlacesReview[] }> })?.places?.[0];
  return (place?.reviews ?? [])
    .map((r) => ({
      author: r.authorAttribution?.displayName?.trim() || "Client Google",
      rating: typeof r.rating === "number" ? r.rating : null,
      text: (r.originalText?.text || r.text?.text || "").trim(),
      relativeDate: r.relativePublishTimeDescription ?? "",
    }))
    .filter((r) => r.text.length > 0)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, max);
}

export function placesReviewsEnabled(): boolean {
  return Boolean(process.env.GOOGLE_PLACES_API_KEY);
}

export async function fetchPlacesReviews(name: string, city: string, fetchImpl: typeof fetch = fetch): Promise<Review[]> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return [];
  try {
    const res = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELD_MASK },
      body: JSON.stringify({ textQuery: `${name} ${city}`.trim(), languageCode: "fr", regionCode: "FR", pageSize: 1 }),
    });
    if (!res.ok) {
      log("places", `API Places : HTTP ${res.status} pour "${name}"`);
      return [];
    }
    return mapPlacesReviews(await res.json());
  } catch (err) {
    log("places", `API Places indisponible pour "${name}" : ${(err as Error).message}`);
    return [];
  }
}
