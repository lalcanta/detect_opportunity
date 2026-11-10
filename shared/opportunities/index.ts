/**
 * Registre des opportunités : seule source de vérité pour le CLI et le dashboard.
 * Ajouter une opportunité : docs/PLAN_REFONTE_LEADS.md §4.
 */
import { adsAcquisition } from "./definitions/adsAcquisition";
import { auditQaTrackers } from "./definitions/auditQaTrackers";
import { custom } from "./definitions/custom";
import { googleReviews } from "./definitions/googleReviews";
import { seoLocal } from "./definitions/seoLocal";
import { website } from "./definitions/website";
import { SCAN_MODULE_IDS, type OpportunityDefinition } from "./types";

export * from "./types";
export * from "./qualification";

/** Ordre d'affichage dans le dashboard. */
export const OPPORTUNITIES = [website, auditQaTrackers, googleReviews, seoLocal, adsAcquisition, custom] as const;

export type OpportunityId = (typeof OPPORTUNITIES)[number]["id"];

export const ALL_OPPORTUNITY_IDS: OpportunityId[] = OPPORTUNITIES.map((o) => o.id);

/** Opportunités proposées au scan (hors brouillons). */
export const ACTIVE_OPPORTUNITIES: readonly OpportunityDefinition[] = OPPORTUNITIES.filter((o) => o.status === "active");

/** Opportunité d'un lead ou d'un scan qui n'en précise pas. */
export const DEFAULT_OPPORTUNITY_ID: OpportunityId = website.id;

/** Opportunité par défaut d'un scan sur une liste de domaines (`domains:…`), sans passer par Maps. */
export const DEFAULT_DIRECT_DOMAINS_OPPORTUNITY_ID: OpportunityId = auditQaTrackers.id;

export function isOpportunityId(id: unknown): id is OpportunityId {
  return typeof id === "string" && (ALL_OPPORTUNITY_IDS as string[]).includes(id);
}

/** Identifiant stocké sur un lead ou un scan, avec la valeur par défaut si absent. */
export function opportunityIdOf(raw?: string | null): string {
  return raw || DEFAULT_OPPORTUNITY_ID;
}

/** Définition connue, ou `undefined` pour un identifiant inconnu. */
export function findOpportunity(id?: string | null): OpportunityDefinition | undefined {
  const key = opportunityIdOf(id);
  return OPPORTUNITIES.find((o) => o.id === key);
}

/** Définition connue, sinon celle de l'opportunité par défaut. */
export function getOpportunityOrDefault(id?: string | null): OpportunityDefinition {
  return findOpportunity(id) ?? website;
}

/** Vérifications à lancer : celles de l'opportunité, ou toutes pour une opportunité inconnue ou absente. */
export function scanModulesFor(id?: string | null): readonly (typeof SCAN_MODULE_IDS)[number][] {
  if (!id) return SCAN_MODULE_IDS;
  return OPPORTUNITIES.find((o) => o.id === id)?.scanModules ?? SCAN_MODULE_IDS;
}
