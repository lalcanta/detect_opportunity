import type { MapsCompetitor } from "../types";

/** Concurrents à retenir : les mieux classés d'abord, complétés par les suivants les plus proches, sans le lead. */
export function pickCompetitors(places: MapsCompetitor[], leadRank: number, max = 5): MapsCompetitor[] {
  const others = places.filter((p) => p.rank !== leadRank).sort((a, b) => a.rank - b.rank);
  const better = others.filter((p) => p.rank < leadRank).slice(0, max);
  const following = others.filter((p) => p.rank > leadRank).slice(0, max - better.length);
  return [...better, ...following];
}

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Recherche Maps telle qu'elle a été lancée, pour l'afficher dans le bilan. */
export function searchLabel(subQuery: string, city: string, fromCoords: boolean): string {
  if (fromCoords) return `${subQuery} autour de ${city}`;
  return normalize(subQuery).includes(normalize(city)) ? subQuery : `${subQuery} ${city}`;
}
