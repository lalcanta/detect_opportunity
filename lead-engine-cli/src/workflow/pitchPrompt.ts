/**
 * Consigne complète des textes commerciaux, assemblée à partir des constats des nœuds du workflow
 * (`pitchFacts`) et de l'angle de la preuve (`proofAngle`). Identique en mode préparation (écrite dans
 * `prompt_battlecard.md`) et en mode complet (envoyée au modèle). Aucune mesure n'est écrite en dur ici : tout ce que
 * la consigne affirme sur le prospect vient des constats.
 */
import { messageToneInstruction } from "../../../shared/opportunities";
import { pitchFacts, proofAngle, type PitchInput } from "./pitchFacts";

export type LlmPitchGenerator = "llm_phone_battlecard" | "llm_cold_email";

export const STOP_LINE = "Pour ne plus recevoir de message de notre part, répondez simplement STOP.";

function roleSection(p: PitchInput, generator: LlmPitchGenerator): string {
  if (generator === "llm_phone_battlecard") {
    return "Tu prépares le dossier commercial d'une closer (téléprospectrice) pour un premier contact par téléphone, ainsi qu'un message WhatsApp et un brouillon d'email.";
  }
  const support = p.primaryChannel === "contact_form"
    ? "collé dans le formulaire de contact de son site (pas d'objet visible, texte brut)"
    : "envoyé par email";
  return `Tu rédiges un premier message écrit de prospection, ${support}.`;
}

function offerSection(p: PitchInput): string {
  const lines = [`Offre : ${p.def.label}.`, `Ce que nous proposons : ${p.def.commercial.pitchFocus}.`];
  const angle = proofAngle(p).trim();
  if (angle) lines.push(`Preuve : ${angle}`);
  const tone = messageToneInstruction(p.def.commercial.tone);
  if (tone) lines.push(tone);
  return lines.join("\n");
}

function factsSection(p: PitchInput): string {
  return ["Constats mesurés (les seuls que tu peux citer) :", ...pitchFacts(p).map((f) => `- ${f.label} : ${f.value}`)].join("\n");
}

function rulesSection(p: PitchInput, generator: LlmPitchGenerator): string {
  const phone = generator === "llm_phone_battlecard";
  const rules = [
    "Cite uniquement les constats ci-dessus. N'invente ni avis, ni client, ni certification, ni prix, ni délai, et aucun chiffre absent des constats (ni appels perdus, ni chiffre d'affaires, ni trafic).",
    "Vouvoiement obligatoire, tutoiement interdit. Français, sans promesse mensongère ni jargon.",
    "Un seul constat précis par texte, pas une liste de reproches.",
    "Le lien principal (celui de la preuve, indiqué dans les constats) figure dans chaque message écrit.",
    "Chaque message écrit se termine par une question simple qui appelle une réponse écrite.",
    `Chaque message écrit (email, WhatsApp, formulaire) se termine par la ligne : « ${STOP_LINE} »`,
    "Longueurs : closerBrief 2 phrases au plus ; ourAdvantages 3 puces de 12 mots au plus.",
  ];
  if (phone) {
    rules.push(
      "callScript : une accroche de 60 mots au plus, lue à voix haute : présentation brève, un seul constat précis, annonce que la preuve gratuite est prête et propose de l'envoyer.",
      "objections : deux ou trois objections probables du prospect pour cette offre, chacune avec une réponse de 2 phrases au plus.",
      "whatsappText : 300 caractères au plus, cordial, avec le lien principal.",
      "coldEmail.body : 120 mots au plus.",
    );
  } else {
    rules.push(
      p.primaryChannel === "contact_form"
        ? "coldEmail.body : 900 caractères au plus, texte brut, sans objet visible (coldEmail.subject reste renseigné pour le suivi interne)."
        : "coldEmail.body : 120 mots au plus.",
    );
  }
  return ["Règles :", ...rules.map((r) => `- ${r}`)].join("\n");
}

/** Schéma demandé : descriptions neutres, sans chiffre, sans exemple ni nom de prospect. */
function schemaSection(generator: LlmPitchGenerator): string {
  const common = [
    `  "closerBrief": "Contexte du prospect et angle retenu, pour la personne qui contacte.",`,
    `  "ourAdvantages": ["Avantage concret", "Avantage concret", "Avantage concret"],`,
  ];
  const phone = [
    `  "callScript": "Accroche d'appel.",`,
    `  "objections": [{ "objection": "Objection du prospect", "reply": "Réponse" }],`,
    `  "whatsappText": "Message WhatsApp.",`,
  ];
  const email = [`  "coldEmail": { "subject": "Objet du message", "body": "Le message complet" }`];
  const fields = generator === "llm_phone_battlecard" ? [...common, ...phone, ...email] : [...common, ...email];
  return ["Réponds en JSON strict, sans texte autour :", "{", ...fields, "}"].join("\n");
}

/** Consigne complète : rôle, offre, constats, règles, schéma JSON. Déterministe pour une même entrée. */
export function buildPitchPrompt(p: PitchInput, generator: LlmPitchGenerator): string {
  return [roleSection(p, generator), offerSection(p), factsSection(p), rulesSection(p, generator), schemaSection(generator)].join("\n\n");
}
