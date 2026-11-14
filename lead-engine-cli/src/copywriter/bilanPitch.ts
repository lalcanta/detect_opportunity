/**
 * Libellé du bilan utilisé par les secours sans modèle : le lien `/demos/:id` ouvre le bilan, pas une maquette de site.
 * Les constats cités dans la consigne viennent de `workflow/pitchFacts.ts`, pas d'ici.
 */
export type BilanKind = "visibility_report" | "acquisition_report";

export function bilanLabel(kind: BilanKind): string {
  return kind === "visibility_report" ? "bilan de visibilité locale" : "bilan d'acquisition";
}
