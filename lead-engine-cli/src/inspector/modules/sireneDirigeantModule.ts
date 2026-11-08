import type { ScanModule } from "./types";

interface GouvDirigeant {
  nom?: string;
  prenoms?: string;
  denomination?: string;
  qualite?: string;
}

interface GouvResultItem {
  siren?: string;
  date_creation?: string;
  dirigeants?: GouvDirigeant[];
}

interface GouvSearchResponse {
  results?: GouvResultItem[];
}

/** Formate proprement Prénom + Nom à partir de la réponse de recherche-entreprises.api.gouv.fr */
export function parseSireneApiResponse(data: unknown): {
  siren: string | null;
  keyPeople: string[];
  createdAt: string | null;
} {
  const resp = data as GouvSearchResponse | null;
  const first = resp?.results?.[0];
  if (!first) return { siren: null, keyPeople: [], createdAt: null };

  const people: string[] = [];
  for (const d of first.dirigeants ?? []) {
    if (d.prenoms && d.nom) {
      const firstPrenom = d.prenoms.trim().split(/[\s,]+/)[0] || "";
      const formattedPrenom = firstPrenom
        .split("-")
        .map((p) => (p ? p[0]!.toUpperCase() + p.slice(1).toLowerCase() : ""))
        .join("-");
      const formattedNom = d.nom
        .trim()
        .split(/\s+/)
        .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1).toLowerCase() : ""))
        .join(" ");
      const full = `${formattedPrenom} ${formattedNom}`.trim();
      if (full.length >= 4 && !people.includes(full)) {
        people.push(full);
      }
    }
  }

  return {
    siren: first.siren ?? null,
    keyPeople: people.slice(0, 3),
    createdAt: first.date_creation ?? null,
  };
}

/**
 * Interroge gratuitement l'API officielle de l'État (recherche-entreprises.api.gouv.fr)
 * sans clé API ni quota bloquant, même si l'artisan n'a pas de site web.
 */
export async function lookupCompanySirene(
  companyName: string,
  city?: string | null,
): Promise<{ siren: string | null; keyPeople: string[]; createdAt: string | null }> {
  const cleanName = companyName.replace(/[^\p{L}\p{N}\s'-]/gu, " ").trim();
  if (!cleanName || cleanName.length < 2) {
    return { siren: null, keyPeople: [], createdAt: null };
  }
  const q = city ? `${cleanName} ${city}` : cleanName;
  const endpoint = `https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(q)}&per_page=1`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(endpoint, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return { siren: null, keyPeople: [], createdAt: null };
    const json = await res.json();
    return parseSireneApiResponse(json);
  } catch {
    return { siren: null, keyPeople: [], createdAt: null };
  }
}

export const sireneDirigeantModule: ScanModule = {
  id: "dirigeant_sirene",
  label: "Dirigeant & SIREN Officiel (API Annuaire des Entreprises)",
  description: "Récupère gratuitement le nom/prénom du gérant, le SIREN et la date de création via recherche-entreprises.api.gouv.fr.",
  async afterNavigate({ companyName, city, result, url }) {
    const fallbackName = companyName || url.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split(".")[0] || "";
    const info = await lookupCompanySirene(fallbackName, city);
    if (info.siren) result.siren = info.siren;
    if (info.createdAt) result.companyCreatedAt = info.createdAt;
    if (info.keyPeople.length > 0) {
      const merged = new Set<string>([...(result.keyPeople ?? []), ...info.keyPeople]);
      result.keyPeople = [...merged].slice(0, 3);
    }
  },
};
