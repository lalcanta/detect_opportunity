import type { ChannelId, OpportunityDefinition } from "../../../shared/opportunities";
import type { ModelRouter } from "../llm/modelRouter";
import type { Battlecard, MapsLead, SiteAudit, TokenUsageRecord } from "../types";
import { extractJson, log } from "../utils/helpers";
import { battlecardSchema } from "./battlecard";

/**
 * TASK_FAST : message écrit de premier contact, envoyé par email ou collé dans le formulaire de contact du prospect.
 * Générique : l'angle vient de l'opportunité (libellé et argument commercial du registre).
 */
export async function generateColdEmailPitch(
  router: ModelRouter,
  lead: MapsLead,
  audit: SiteAudit,
  demoUrl: string,
  usageSink: TokenUsageRecord[],
  def: Pick<OpportunityDefinition, "label" | "commercial">,
  channel: ChannelId,
): Promise<Battlecard> {
  const viaForm = channel === "contact_form";
  const best = [...lead.recentReviews].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))[0];
  const prompt = `Tu rédiges un premier message écrit de prospection pour ${lead.name} (${lead.activity}, ${lead.city}).
Il sera ${viaForm ? "collé dans le formulaire de contact de son site (pas d'objet visible, texte brut, 900 caractères maximum)" : "envoyé par email"}.
Offre : ${def.label}. Angle : ${def.commercial.pitchFocus}.
Constat sur sa présence actuelle : ${audit.summary}. Points faibles : ${audit.weaknesses.join(" ; ")}.
Note Google : ${lead.rating ?? "n/a"}/5 (${lead.reviewsCount ?? "n/a"} avis).${best ? ` Avis réel à citer : "${best.text}" (${best.author}).` : ""}
Lien de la démo déjà préparée pour lui : ${demoUrl}

Règles : vouvoiement, ton chaleureux et professionnel, un seul constat précis, le lien de la démo, une question simple
pour obtenir une réponse écrite. Pas de promesse chiffrée, pas de jargon. Le message se termine par
« Pour ne plus recevoir de message de notre part, répondez simplement STOP. »

Réponds en JSON strict :
{
  "closerBrief": "2 phrases pour la personne qui envoie le message : contexte du prospect et angle retenu.",
  "ourAdvantages": ["Avantage concret 1", "Avantage concret 2", "Avantage concret 3"],
  "coldEmail": { "subject": "Objet court et personnalisé", "body": "Le message complet" }
}`;

  try {
    const { text } = await router.generate({ task: "battlecard", prompt, json: true, usageSink });
    const card = battlecardSchema.parse(extractJson(text));
    if (!card.coldEmail) throw new Error("coldEmail absent de la réponse");
    if (!card.coldEmail.body.includes(demoUrl)) card.coldEmail.body += `\n\n${demoUrl}`;
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
        subject: `${lead.name} : une proposition préparée pour vous`,
        body: `Bonjour,\n\nNous avons préparé pour ${lead.name} une démonstration personnalisée (${def.label.toLowerCase()}) : ${demoUrl}\n\nSeriez-vous d'accord pour que nous en parlions ?\n\nBien cordialement,\n\nPour ne plus recevoir de message de notre part, répondez simplement STOP.`,
      },
    };
  }
}
