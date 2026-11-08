import { z } from "zod";
import type { ModelRouter } from "../llm/modelRouter";
import type { MapsLead, SiteAudit, SiteInspection, TokenUsageRecord } from "../types";

const auditSchema = z.object({
  summary: z.string(),
  weaknesses: z.array(z.string()).min(1).max(6),
  score: z.number().min(0).max(100),
});

/** TASK_FAST : audit technique synthétique à partir des mesures + capture. */
export async function auditSite(
  router: ModelRouter,
  lead: MapsLead,
  inspection: SiteInspection | null,
  usageSink: TokenUsageRecord[],
): Promise<SiteAudit> {
  if (!inspection || inspection.error || !inspection.screenshot) {
    return {
      summary: inspection?.error
        ? `Site inaccessible ou très lent (${inspection.error})`
        : "Aucun site web référencé sur Google Maps",
      weaknesses: [inspection?.error ? "Site inaccessible" : "Pas de site web : invisible hors Maps"],
      score: 0,
    };
  }
  const prompt = `Tu es auditeur web. Entreprise : ${lead.name} (${lead.activity}, ${lead.city}).
Mesures : temps de chargement ${inspection.loadTimeMs} ms ; responsive mobile : ${inspection.isResponsive}; couleurs dominantes : ${inspection.dominantColors.join(", ") || "n/a"}.
Analyse la capture jointe et ces mesures. Réponds en JSON : {"summary": string (1 phrase), "weaknesses": string[] (3 à 5 points faibles précis, concrets, visibles), "score": number 0-100}. Français.`;
  const { text } = await router.generate({
    task: "audit",
    prompt,
    images: [{ mimeType: "image/jpeg", data: inspection.screenshot }],
    json: true,
    usageSink,
  });
  return auditSchema.parse(JSON.parse(text));
}
