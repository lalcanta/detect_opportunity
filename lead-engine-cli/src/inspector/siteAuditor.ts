import { z } from "zod";
import type { ModelRouter } from "../llm/modelRouter";
import type { MapsLead, SiteAudit, SiteInspection, TokenUsageRecord } from "../types";
import { extractJson, log } from "../utils/helpers";

const auditSchema = z.object({
  summary: z.string(),
  weaknesses: z.array(z.string()).min(1).max(6),
  score: z.number().min(0).max(100),
});

/** Au-delà, un temps de chargement mesuré est présenté comme une faiblesse. */
export const SLOW_LOAD_MS = 3000;

/**
 * Audit de repli quand l'inspection ou le LLM ne fournit rien : uniquement des mesures de l'inspection.
 * Sans mesure : pas de score (null) et pas de faiblesse ; jamais de valeur inventée.
 */
export function buildFallbackAudit(inspection: SiteInspection | null): SiteAudit {
  const weaknesses: string[] = [];
  if (inspection?.error) weaknesses.push(`Site inaccessible lors de l'inspection (${inspection.error})`);
  if (inspection?.isResponsive === false) weaknesses.push("Site non adapté aux écrans de smartphone (mesuré à l'inspection)");
  if (!inspection?.error && typeof inspection?.loadTimeMs === "number" && inspection.loadTimeMs > SLOW_LOAD_MS) {
    weaknesses.push(`Temps de chargement mesuré : ${inspection.loadTimeMs} ms`);
  }
  const summary = inspection?.error
    ? `Site inaccessible lors de l'inspection (${inspection.error}).`
    : weaknesses.length > 0
      ? `Mesures de l'inspection : ${weaknesses.join(" ; ")}.`
      : "Aucune analyse détaillée disponible : seules les mesures de l'inspection sont exploitables.";
  return { summary, weaknesses, score: null };
}

/** TASK_FAST : audit technique synthétique à partir des mesures + capture. */
export async function auditSite(
  router: ModelRouter,
  lead: MapsLead,
  inspection: SiteInspection | null,
  usageSink: TokenUsageRecord[],
): Promise<SiteAudit> {
  const fallbackAudit = buildFallbackAudit(inspection);

  if (!inspection || inspection.error || !inspection.screenshot) {
    return fallbackAudit;
  }
  const prompt = `Tu es auditeur web. Entreprise : ${lead.name} (${lead.activity}, ${lead.city}).
Mesures : temps de chargement ${inspection.loadTimeMs} ms ; responsive mobile : ${inspection.isResponsive}; couleurs dominantes : ${inspection.dominantColors.join(", ") || "n/a"}.
Analyse la capture jointe et ces mesures. Réponds en JSON strict : {"summary": string (1 phrase), "weaknesses": string[] (3 à 5 points faibles précis, concrets, visibles), "score": number 0-100}. Français.`;
  try {
    const { text } = await router.generate({
      task: "audit",
      prompt,
      images: [{ mimeType: "image/jpeg", data: inspection.screenshot }],
      json: true,
      usageSink,
    });
    const parsed = extractJson(text, fallbackAudit);
    const validated = auditSchema.safeParse(parsed);
    if (validated.success) return validated.data;
    log("audit", `Audit non conforme au schéma, utilisation du fallback enrichi`);
    return fallbackAudit;
  } catch (err) {
    log("audit", `Erreur d'audit LLM : ${(err as Error).message} → utilisation fallback déterministe`);
    return fallbackAudit;
  }
}
