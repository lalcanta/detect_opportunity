import { z } from "zod";
import type { ModelRouter } from "../llm/modelRouter";
import type { Battlecard, MapsLead, SiteAudit, TokenUsageRecord } from "../types";
import { extractJson, log } from "../utils/helpers";
import type { PitchDefinition } from "../../../shared/opportunities";

const battlecardSchema = z.object({
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

/** TASK_FAST : script d'appel vocal ou Cold Email asynchrone selon l'opportunité. */
export async function generateBattlecard(
  router: ModelRouter,
  lead: MapsLead,
  audit: SiteAudit,
  demoUrl: string,
  usageSink: TokenUsageRecord[],
  kind: PitchDefinition["kind"] = "phone_battlecard",
): Promise<Battlecard> {
  const isAsyncEmail = kind === "cold_email";

  if (isAsyncEmail) {
    const prompt = `# RÔLE & PERSONA
Tu es un agent d'automatisation chargé de rédiger des emails d'approche personnalisés de confrère à confrère pour Loïc Alcantara.
- Identité : Loïc Alcantara, développeur web senior avec 14 ans d’expérience (conception de backends critiques, robustesse réseau, performance et CI/CD).
- Ton : Confraternel, humble, ultra-précis, factuel, décontracté mais professionnel. Aucun ton commercial, marketing ou "growth hacker".
- Règle d'or de communication : 100% ASYNCHRONE ET ÉCRIT. Loïc n'est PAS disponible par téléphone. 
  -> INTERDICTION FORMELLE de proposer un appel téléphonique, une visio, un lien Calendly ou un "échange de 15 minutes". Tout se fait par simple retour d'email.

# CIBLE & DONNÉES DU PROSPECT
- Nom / Entreprise : ${lead.name}
- Domaine / Site : ${lead.website || "votre site"}
- Points faibles / traceurs détectés : ${audit.weaknesses.join(", ")}
- Lien du rapport interactif : ${demoUrl}

# STRUCTURE STRICTE
1. Objet : [Dev QA] Petite régression réseau repérée sur ${lead.website ? lead.website.replace(/^https?:\/\//, "").replace(/\/.*$/, "") : lead.name} (tags avant CMP)
2. Salutation : Hello l'équipe ${lead.name},
3. Accroche confraternelle factuelle & légitimité Loïc (14 ans d'exp backend / QA).
4. Le constat technique : traceurs ou scripts interceptés à froid au premier chargement sans consentement préalable.
5. Le lien du rapport interactif en accès libre : 👉 ${demoUrl}
6. L'offre sous-jacente : automatisation CI/CD headless pour surveiller l'ensemble des sites de l'agence.
7. CTA 100% ASYNCHRONE : Dites-moi simplement par retour de mail et je vous branche ça rapidement (je fonctionne 100% à l'écrit / asynchrone).
8. Signature : Loïc Alcantara | Développeur Web Senior (14 ans d'exp) | loic.alcantara@gmail.com

# FORMAT DE SORTIE JSON STRICT
{
  "coldEmail": {
    "subject": "L'objet généré",
    "body": "Le corps complet du message"
  },
  "callScript": "Opportunité 100% asynchrone par email (aucun appel téléphonique)",
  "whatsappText": "",
  "objections": []
}`;

    try {
      const { text } = await router.generate({ task: "battlecard", prompt, json: true, usageSink });
      const parsed = extractJson(text);
      return battlecardSchema.parse(parsed);
    } catch (err) {
      log("battlecard", `Erreur génération battlecard async : ${(err as Error).message} → fallback`);
      return {
        callScript: "Opportunité 100% asynchrone par email (aucun appel téléphonique)",
        whatsappText: "",
        objections: [],
        coldEmail: {
          subject: `Audit technique & conformité web : ${lead.name}`,
          body: `Bonjour l'équipe de ${lead.name},\n\nNous avons préparé un rapport technique interactif accessible ici : ${demoUrl}\n\nRestant à votre disposition,\nLoïc Alcantara`,
        },
      };
    }
  }

  const best = [...lead.recentReviews].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))[0];
  const prompt = `Tu prépares le dossier commercial d'un artisan pour la closer (téléprospectrice) ET un brouillon d'email contextuel.
Entreprise : ${lead.name} (${lead.activity}, ${lead.city}). Note ${lead.rating ?? "n/a"}/5, ${lead.reviewsCount ?? "n/a"} avis.
Site actuel : ${audit.summary}. Points faibles : ${audit.weaknesses.join(" ; ")}.
Avis client réel à citer : ${best ? `"${best.text}" (${best.author})` : "aucun"}.
Lien de la démo déjà créée pour lui : ${demoUrl}

Réponds en JSON strict :
{
 "closerBrief": "Petit laïus de 2-3 phrases pour la closer : explique-lui clairement pourquoi notre solution est supérieure à ce que le prospect a aujourd'hui et quel est l'angle d'attaque idéal pour le convaincre.",
 "ourAdvantages": [
   "Avantage concret 1 de notre démo par rapport à sa situation actuelle (ex: bouton d'appel d'urgence mobile)",
   "Avantage concret 2 (ex: mise en avant de ses ${lead.reviewsCount ?? ""} avis Google 5 étoiles)",
   "Avantage concret 3 (ex: rapidité et image professionnelle face aux concurrents de ${lead.city})"
 ],
 "callScript": "script d'appel de 6-8 phrases, tutoiement interdit, qui (1) se présente brièvement, (2) cite UN point faible PRÉCIS du site actuel, (3) fait l'éloge de l'avis client réel cité, (4) annonce qu'une démo gratuite est prête et propose de l'envoyer",
 "objections": [
   {"objection": "J'ai déjà un webmaster / mon site me suffit", "reply": "..."},
   {"objection": "Je n'ai pas le temps", "reply": "..."}
 ],
 "whatsappText": "message court (max 300 caractères) cordial, qui contient exactement le lien ${demoUrl}",
 "coldEmail": {
   "subject": "Objet d'email personnalisé pour ${lead.name}",
   "body": "Email court, chaleureux et adapté au contexte exact de ${lead.name} (${lead.activity} à ${lead.city}), expliquant les avantages de la maquette préparée pour lui (${demoUrl}) par rapport à sa situation actuelle."
 }
}
Français, ton chaleureux et professionnel, sans promesse mensongère.`;

  try {
    const { text } = await router.generate({ task: "battlecard", prompt, json: true, usageSink });
    const parsed = extractJson(text);
    const card = battlecardSchema.parse(parsed);
    if (card.whatsappText && !card.whatsappText.includes(demoUrl)) card.whatsappText += ` ${demoUrl}`;
    return card;
  } catch (err) {
    log("battlecard", `Erreur génération battlecard : ${(err as Error).message} → utilisation fallback`);
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
