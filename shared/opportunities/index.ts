/**
 * Registre des opportunités (« besoins ») : seule source de vérité pour le CLI et le dashboard.
 *
 * Les définitions du code (`CODE_OPPORTUNITIES`) sont les valeurs initiales. Le dashboard les copie dans sa base,
 * où l'admin peut les modifier ; le dashboard et le worker chargent ensuite ces définitions avec
 * `setOpportunityDefinitions`. Les tableaux exportés (`OPPORTUNITIES`, `ALL_OPPORTUNITY_IDS`,
 * `ACTIVE_OPPORTUNITIES`) sont mis à jour sur place : les modules qui les importent voient toujours la version
 * chargée. Pour un tableau dérivé, s'abonner avec `onOpportunitiesChange`.
 */
import { adsAcquisition } from "./definitions/adsAcquisition";
import { auditQaTrackers } from "./definitions/auditQaTrackers";
import { custom } from "./definitions/custom";
import { googleReviews } from "./definitions/googleReviews";
import { seoLocal } from "./definitions/seoLocal";
import { website } from "./definitions/website";
import { SCAN_MODULE_IDS, type OpportunityDefinition } from "./types";
import { validateOpportunityDefinition } from "./validate";

export * from "./types";
export * from "./qualification";
export * from "./validate";

/** Définitions livrées avec le code, dans l'ordre d'affichage : valeurs initiales de la base du dashboard. */
export const CODE_OPPORTUNITIES: readonly OpportunityDefinition[] = [website, auditQaTrackers, googleReviews, seoLocal, adsAcquisition, custom];

/** Définitions en vigueur (code, ou base du dashboard une fois chargée), dans l'ordre d'affichage. */
export const OPPORTUNITIES: OpportunityDefinition[] = [...CODE_OPPORTUNITIES];

/** Identifiant d'opportunité : libre depuis que les besoins sont éditables (validé par `validateOpportunityDefinition`). */
export type OpportunityId = string;

/** Identifiants des définitions en vigueur, archivées comprises (les anciens leads les portent encore). */
export const ALL_OPPORTUNITY_IDS: OpportunityId[] = OPPORTUNITIES.map((o) => o.id);

/** Opportunités proposées au scan (ni brouillon ni archivée). */
export const ACTIVE_OPPORTUNITIES: OpportunityDefinition[] = OPPORTUNITIES.filter((o) => o.status === "active");

/** Opportunité d'un lead ou d'un scan qui n'en précise pas. */
export const DEFAULT_OPPORTUNITY_ID: OpportunityId = website.id;

/** Opportunité par défaut d'un scan sur une liste de domaines (`domains:…`), sans passer par Maps. */
export const DEFAULT_DIRECT_DOMAINS_OPPORTUNITY_ID: OpportunityId = auditQaTrackers.id;

const listeners: Array<() => void> = [];

/** Appelé après chaque chargement de définitions (pour recalculer un tableau dérivé). */
export function onOpportunitiesChange(listener: () => void): void {
  listeners.push(listener);
}

function replaceInPlace<T>(target: T[], values: readonly T[]): void {
  target.splice(0, target.length, ...values);
}

/**
 * Remplace les définitions en vigueur. Les définitions invalides sont ignorées ; une liste vide (ou entièrement
 * invalide) laisse les définitions du code. Renvoie les erreurs par identifiant, pour les journaux.
 */
export function setOpportunityDefinitions(raw: readonly unknown[]): { loaded: number; errors: Record<string, string[]> } {
  const valid: OpportunityDefinition[] = [];
  const errors: Record<string, string[]> = {};
  raw.forEach((item, i) => {
    const res = validateOpportunityDefinition(item);
    const key = (item as { id?: unknown })?.id;
    if (!res.ok) errors[typeof key === "string" ? key : `#${i}`] = res.errors;
    else if (valid.some((v) => v.id === res.def.id)) errors[res.def.id] = ["identifiant en double"];
    else valid.push(res.def);
  });
  replaceInPlace(OPPORTUNITIES, valid.length > 0 ? valid : CODE_OPPORTUNITIES);
  replaceInPlace(ALL_OPPORTUNITY_IDS, OPPORTUNITIES.map((o) => o.id));
  replaceInPlace(ACTIVE_OPPORTUNITIES, OPPORTUNITIES.filter((o) => o.status === "active"));
  for (const l of listeners) l();
  return { loaded: valid.length, errors };
}

/** Revient aux définitions du code (tests). */
export function resetOpportunityDefinitions(): void {
  setOpportunityDefinitions(CODE_OPPORTUNITIES);
}

export function isOpportunityId(id: unknown): id is OpportunityId {
  return typeof id === "string" && ALL_OPPORTUNITY_IDS.includes(id);
}

/** Identifiant stocké sur un lead ou un scan, avec la valeur par défaut si absent. */
export function opportunityIdOf(raw?: string | null): string {
  return raw || DEFAULT_OPPORTUNITY_ID;
}

/** Définition en vigueur, ou `undefined` pour un identifiant inconnu. */
export function findOpportunity(id?: string | null): OpportunityDefinition | undefined {
  const key = opportunityIdOf(id);
  return OPPORTUNITIES.find((o) => o.id === key);
}

/** Définition en vigueur, sinon celle de l'opportunité par défaut (ou celle du code en dernier recours). */
export function getOpportunityOrDefault(id?: string | null): OpportunityDefinition {
  return findOpportunity(id) ?? findOpportunity(DEFAULT_OPPORTUNITY_ID) ?? website;
}

/** Vérifications à lancer : celles de l'opportunité, ou toutes pour une opportunité inconnue ou absente. */
export function scanModulesFor(id?: string | null): readonly (typeof SCAN_MODULE_IDS)[number][] {
  if (!id) return SCAN_MODULE_IDS;
  return OPPORTUNITIES.find((o) => o.id === id)?.scanModules ?? SCAN_MODULE_IDS;
}
