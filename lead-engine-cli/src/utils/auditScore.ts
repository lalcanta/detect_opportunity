/** Score d'audit déjà enregistré : repris tel quel s'il est numérique, sinon `null` (jamais de valeur de repli inventée). */
export function existingAuditScore(raw: unknown): number | null {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}
