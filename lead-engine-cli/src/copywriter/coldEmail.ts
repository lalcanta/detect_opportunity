import { isReportProof, type ChannelId, type OpportunityDefinition } from "../../../shared/opportunities";
import type { ModelRouter } from "../llm/modelRouter";
import type { Battlecard, MapsLead, TokenUsageRecord } from "../types";
import { extractJson, log } from "../utils/helpers";
import { battlecardSchema } from "./battlecard";
import { STOP_LINE } from "../workflow/pitchPrompt";
import { bilanLabel } from "./bilanPitch";

/** Ajoute le lien principal s'il manque : avant la ligne STOP (qui reste la dernière ligne) si elle est présente, sinon à la fin. */
export function withMainLink(body: string, url: string): string {
  if (body.includes(url)) return body;
  const stop = body.lastIndexOf(STOP_LINE);
  if (stop < 0) return `${body}\n\n${url}`;
  return `${body.slice(0, stop).trimEnd()}\n\n${url}\n\n${body.slice(stop)}`;
}

/**
 * TASK_FAST : message écrit de premier contact, envoyé par email ou collé dans le formulaire de contact du prospect.
 * La consigne est assemblée en amont (`buildPitchPrompt`) ; ici : appel au modèle, validation, secours sans IA.
 */
export async function generateColdEmailPitch(
  router: ModelRouter,
  prompt: string,
  lead: MapsLead,
  demoUrl: string,
  usageSink: TokenUsageRecord[],
  def: Pick<OpportunityDefinition, "label" | "proof">,
  channel: ChannelId,
): Promise<Battlecard> {
  const viaForm = channel === "contact_form";
  const bilan = isReportProof(def.proof.kind) ? def.proof.kind : null;
  const label = bilan ? bilanLabel(bilan) : "";
  try {
    const { text } = await router.generate({ task: "battlecard", prompt, json: true, usageSink });
    const card = battlecardSchema.parse(extractJson(text));
    if (!card.coldEmail) throw new Error("coldEmail absent de la réponse");
    card.coldEmail.body = withMainLink(card.coldEmail.body, demoUrl);
    return { ...card, callScript: "", objections: [], whatsappText: "" };
  } catch (err) {
    log("battlecard", `Erreur génération message écrit : ${(err as Error).message} → fallback`);
    return {
      closerBrief: `${lead.activity} à ${lead.city}, contacté par ${viaForm ? "formulaire" : "email"} pour : ${def.label}.`,
      ourAdvantages: [],
      callScript: "",
      objections: [],
      whatsappText: "",
      coldEmail: {
        subject: bilan ? `${lead.name} : votre ${label}` : `${lead.name} : une proposition préparée pour vous`,
        body: `Bonjour,\n\nNous avons préparé pour ${lead.name} ${bilan ? `un ${label}, à partir des données publiques de Google` : `une démonstration personnalisée (${def.label.toLowerCase()})`} : ${demoUrl}\n\nSeriez-vous d'accord pour que nous en parlions ?\n\nBien cordialement,\n\nPour ne plus recevoir de message de notre part, répondez simplement STOP.`,
      },
    };
  }
}
