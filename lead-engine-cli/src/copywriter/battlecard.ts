import { z } from "zod";
import type { ModelRouter } from "../llm/modelRouter";
import type { Battlecard, MapsLead, TokenUsageRecord } from "../types";
import { extractJson, log } from "../utils/helpers";
import { bilanLabel, type BilanKind } from "./bilanPitch";

export const battlecardSchema = z.object({
  closerBrief: z.string().optional(),
  ourAdvantages: z.array(z.string()).optional(),
  callScript: z.string().min(10).optional().default("Bonjour, je vous contacte concernant votre audit technique."),
  objections: z.array(z.object({ objection: z.string(), reply: z.string() })).optional().default([]),
  whatsappText: z.string().optional().default(""),
  coldEmail: z.object({
    subject: z.string(),
    body: z.string(),
  }).optional(),
});

/**
 * TASK_FAST : dossier du closer pour un premier contact par téléphone (script, objections, WhatsApp, brouillon d'email).
 * La consigne est assemblée en amont (`buildPitchPrompt`) ; ici : appel au modèle, validation, secours sans IA.
 */
export async function generateBattlecard(
  router: ModelRouter,
  prompt: string,
  lead: MapsLead,
  demoUrl: string,
  usageSink: TokenUsageRecord[],
  /** Preuve « bilan » : le secours présente le bilan et non une maquette de site. */
  bilan: BilanKind | null = null,
): Promise<Battlecard> {
  try {
    const { text } = await router.generate({ task: "battlecard", prompt, json: true, usageSink });
    const parsed = extractJson(text);
    const card = battlecardSchema.parse(parsed);
    if (card.whatsappText && !card.whatsappText.includes(demoUrl)) card.whatsappText += ` ${demoUrl}`;
    return card;
  } catch (err) {
    log("battlecard", `Erreur génération battlecard : ${(err as Error).message} → utilisation fallback`);
    if (bilan) return bilanFallback(lead, demoUrl, bilanLabel(bilan));
    return {
      closerBrief: `Artisan local (${lead.activity} à ${lead.city}). Notre démo personnalisée met en valeur ses services et facilite la prise de contact directe.`,
      ourAdvantages: [
        "Landing page ultra-rapide adaptée aux smartphones",
        "Mise en valeur directe des coordonnées et avis clients",
        "Boutons d'appel et de rappel immédiat",
      ],
      callScript: `Bonjour, je suis du cabinet digital partenaire. J'ai préparé pour ${lead.name} une maquette moderne et interactive de votre futur site web, visible sur ${demoUrl}. Souhaitez-vous que je vous l'envoie par SMS ou WhatsApp ?`,
      objections: [
        { objection: "J'ai déjà un site web", reply: "Absolument, notre démo est justement conçue pour moderniser l'existant et doubler les contacts mobiles sans changer vos habitudes." },
        { objection: "Je n'ai pas le temps", reply: "La démo est 100% prête, cela vous prendra 30 secondes pour y jeter un œil sur votre téléphone." }
      ],
      whatsappText: `Bonjour ${lead.name}, voici la démo de votre nouveau site conçue sur-mesure pour votre activité : ${demoUrl}`,
      coldEmail: {
        subject: `Proposition de modernisation web pour ${lead.name}`,
        body: `Bonjour,\n\nNous avons conçu une nouvelle version optimisée pour votre activité : ${demoUrl}\n\nN'hésitez pas si vous avez des questions !`
      }
    };
  }
}

/** Secours sans modèle pour un bilan : on envoie le bilan, sans promettre de site. */
function bilanFallback(lead: MapsLead, demoUrl: string, label: string): Battlecard {
  return {
    closerBrief: `${lead.activity} à ${lead.city}. Un ${label} gratuit est prêt : il montre sa situation sur Google à la date du constat et les actions prioritaires.`,
    ourAdvantages: [
      "Constats relevés sur des données publiques, datés",
      "Actions prioritaires concrètes, sans engagement",
      "Accompagnement pour corriger les points relevés",
    ],
    callScript: `Bonjour, j'ai préparé pour ${lead.name} un ${label} gratuit, à partir des données publiques de Google. Il est visible sur ${demoUrl}. Souhaitez-vous que je vous l'envoie par SMS ou WhatsApp ?`,
    objections: [
      { objection: "Je n'ai pas le temps", reply: `Le ${label} est déjà prêt : deux minutes suffisent pour le parcourir sur votre téléphone.` },
      { objection: "Ça ne m'intéresse pas", reply: "Je comprends. Le bilan reste gratuit et sans engagement : il vous indique simplement les points relevés à la date du constat." },
    ],
    whatsappText: `Bonjour ${lead.name}, voici le ${label} préparé pour votre activité : ${demoUrl}`,
    coldEmail: {
      subject: `${lead.name} : votre ${label}`,
      body: `Bonjour,\n\nNous avons préparé pour ${lead.name} un ${label}, à partir des données publiques de Google : ${demoUrl}\n\nN'hésitez pas si vous avez des questions !`,
    },
  };
}
