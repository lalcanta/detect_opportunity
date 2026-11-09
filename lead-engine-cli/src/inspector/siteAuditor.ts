import { z } from "zod";
import type { ModelRouter } from "../llm/modelRouter";
import type { MapsLead, SiteAudit, SiteInspection, TokenUsageRecord } from "../types";
import { extractJson, log } from "../utils/helpers";

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
  const fallbackAudit: SiteAudit = {
    summary: inspection?.error
      ? `Site inaccessible ou très lent (${inspection.error})`
      : inspection?.isResponsive === false
        ? `Site existant mais non adapté aux mobiles et lent au chargement (${inspection.loadTimeMs || 1500} ms).`
        : `Site web artisanal nécessitant une modernisation visuelle et de meilleurs points de contact.`,
    weaknesses: [
      inspection?.isResponsive === false ? "Non adapté aux écrans smartphones (expérience mobile dégradée)" : "Design vieillissant sans mise en valeur des avis clients",
      "Absence de bouton d'appel direct ou de devis instantané",
      "Temps de chargement ou performances perfectibles",
    ],
    score: inspection?.isResponsive === false ? 35 : 55,
  };

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
