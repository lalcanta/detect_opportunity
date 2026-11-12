/**
 * Validation d'une définition d'opportunité venue de l'extérieur du code (base du dashboard, formulaire d'édition,
 * réponse de l'API au worker). Reprend les règles de cohérence du registre (registry.test.ts) pour qu'une
 * définition éditée ne puisse pas produire un scan impossible.
 */
import {
  BADGE_TONES,
  BUSINESS_MODELS,
  CHANNEL_IDS,
  DEMO_FOCUSES,
  OPPORTUNITY_STATUSES,
  PITCH_GENERATOR_IDS,
  PITCH_KIND_BY_GENERATOR,
  SCAN_MODULE_IDS,
  WEBSITE_REQUIREMENTS,
  type ChannelId,
  type OpportunityDefinition,
} from "./types";

export type ValidationResult = { ok: true; def: OpportunityDefinition } | { ok: false; errors: string[] };

const CHANNEL_NAMES: Record<ChannelId, string> = { phone: "téléphone", email: "email", contact_form: "formulaire" };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);

function stringList<T extends string>(list: readonly T[], v: unknown, field: string, errors: string[]): T[] {
  if (!Array.isArray(v)) {
    errors.push(`${field} : liste attendue`);
    return [];
  }
  const out: T[] = [];
  for (const item of v) {
    if (!oneOf(list, item)) errors.push(`${field} : valeur inconnue « ${String(item)} »`);
    else if (out.includes(item)) errors.push(`${field} : « ${item} » en double`);
    else out.push(item);
  }
  return out;
}

/** Vérifie la forme et la cohérence d'une définition ; renvoie une copie normalisée si elle est valide. */
export function validateOpportunityDefinition(raw: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObj(raw)) return { ok: false, errors: ["définition absente ou mal formée"] };

  const id = raw.id;
  if (typeof id !== "string" || !/^[a-z][a-z0-9_]{1,40}$/.test(id)) {
    errors.push("identifiant : minuscules, chiffres et _ uniquement (2 à 41 caractères, commence par une lettre)");
  }
  if (!oneOf(OPPORTUNITY_STATUSES, raw.status)) errors.push("statut : actif, brouillon ou archivé");
  if (!isStr(raw.label)) errors.push("libellé manquant");
  if (!isStr(raw.icon)) errors.push("icône manquante");

  const badge = isObj(raw.badge) ? raw.badge : {};
  if (!isStr(badge.text)) errors.push("texte du badge manquant");
  if (!oneOf(BADGE_TONES, badge.tone)) errors.push("couleur du badge inconnue");

  const req = isObj(raw.requirements) ? raw.requirements : {};
  if (!oneOf(WEBSITE_REQUIREMENTS, req.website)) errors.push("prérequis site : exigé, interdit ou facultatif");
  const contacts = isObj(req.contacts) ? req.contacts : {};
  const allOf = contacts.allOf === undefined ? [] : stringList(CHANNEL_IDS, contacts.allOf, "contacts obligatoires", errors);
  const anyOf = contacts.anyOf === undefined ? [] : stringList(CHANNEL_IDS, contacts.anyOf, "contacts alternatifs", errors);
  if (allOf.length + anyOf.length === 0) errors.push("au moins un contact doit être exigé");

  const channels = stringList(CHANNEL_IDS, raw.channels, "canaux", errors);
  if (channels.length === 0) errors.push("au moins un canal de contact");
  for (const c of [...allOf, ...anyOf]) {
    if (!channels.includes(c)) errors.push(`le contact exigé « ${CHANNEL_NAMES[c]} » doit faire partie des canaux`);
  }

  const scanModules = stringList(SCAN_MODULE_IDS, raw.scanModules, "vérifications du site", errors);
  if (req.website === "forbidden") {
    if (allOf.some((c) => c !== "phone") || (anyOf.length > 0 && !anyOf.includes("phone"))) {
      errors.push("sans site, seul le téléphone peut être exigé (l'email et le formulaire se trouvent sur le site)");
    }
    if (channels.some((c) => c !== "phone")) {
      errors.push("sans site, seul le téléphone peut servir de canal : l'email et le formulaire sont introuvables");
    }
  } else {
    if (scanModules.length === 0) errors.push("au moins une vérification du site");
    if (channels.includes("email") && !scanModules.includes("contacts_legal")) {
      errors.push("le canal email exige la vérification « contacts et mentions légales » (c'est elle qui trouve l'email)");
    }
    if (channels.includes("contact_form") && !scanModules.includes("contact_form")) {
      errors.push("le canal formulaire exige la vérification « formulaire de contact »");
    }
  }

  const proof = isObj(raw.proof) ? raw.proof : {};
  let proofDef: OpportunityDefinition["proof"] | null = null;
  if (!isStr(proof.interestCta)) errors.push("texte du bouton d'intérêt manquant");
  if (proof.kind === "demo_web") {
    if (proof.generator !== "llm_demo") errors.push("une démo de site utilise le générateur llm_demo");
    if (!oneOf(DEMO_FOCUSES, proof.focus)) errors.push("angle de la démo inconnu");
    else proofDef = { kind: "demo_web", generator: "llm_demo", focus: proof.focus, interestCta: String(proof.interestCta ?? "") };
  } else if (proof.kind === "audit_report") {
    if (proof.generator !== "tracker_report") errors.push("un rapport d'audit utilise le générateur tracker_report");
    if (req.website !== "required") errors.push("un rapport d'audit exige que le prospect ait un site");
    proofDef = { kind: "audit_report", generator: "tracker_report", interestCta: String(proof.interestCta ?? "") };
  } else {
    errors.push("type de preuve inconnu (démo de site ou rapport d'audit)");
  }

  const pitchRaw = isObj(raw.pitch) ? raw.pitch : {};
  const pitch: OpportunityDefinition["pitch"] = {};
  for (const [channel, generator] of Object.entries(pitchRaw)) {
    if (!oneOf(CHANNEL_IDS, channel)) {
      errors.push(`message : canal inconnu « ${channel} »`);
      continue;
    }
    if (!channels.includes(channel)) {
      errors.push(`message prévu pour « ${CHANNEL_NAMES[channel]} », qui n'est pas un canal du besoin`);
      continue;
    }
    if (!oneOf(PITCH_GENERATOR_IDS, generator)) {
      errors.push(`message ${CHANNEL_NAMES[channel]} : générateur inconnu`);
      continue;
    }
    const expected = channel === "phone" ? "phone_battlecard" : "cold_email";
    if (PITCH_KIND_BY_GENERATOR[generator] !== expected) {
      errors.push(`message ${CHANNEL_NAMES[channel]} : ${channel === "phone" ? "un script d'appel" : "un message écrit"} est attendu`);
      continue;
    }
    if (generator === "tracker_cold_email" && proof.generator !== "tracker_report") {
      errors.push("l'email d'audit cite le rapport traceurs : il exige la preuve « rapport d'audit »");
      continue;
    }
    pitch[channel] = generator;
  }
  for (const c of channels) if (!pitch[c] && pitchRaw[c] === undefined) errors.push(`aucun message pour le canal ${CHANNEL_NAMES[c]}`);

  const commercial = isObj(raw.commercial) ? raw.commercial : {};
  if (!oneOf(BUSINESS_MODELS, commercial.businessModel)) errors.push("modèle commercial inconnu");
  if (!isStr(commercial.pitchFocus)) errors.push("angle commercial manquant");

  if (errors.length > 0 || !proofDef) return { ok: false, errors };

  const contactReq: OpportunityDefinition["requirements"]["contacts"] = {};
  if (allOf.length) contactReq.allOf = allOf;
  if (anyOf.length) contactReq.anyOf = anyOf;
  return {
    ok: true,
    def: {
      id: id as string,
      status: raw.status as OpportunityDefinition["status"],
      label: String(raw.label).trim(),
      badge: { text: String(badge.text).trim(), tone: badge.tone as OpportunityDefinition["badge"]["tone"] },
      icon: String(raw.icon).trim(),
      requirements: { website: req.website as OpportunityDefinition["requirements"]["website"], contacts: contactReq },
      channels,
      scanModules,
      proof: proofDef,
      pitch,
      flyer: raw.flyer === true,
      commercial: {
        businessModel: commercial.businessModel as OpportunityDefinition["commercial"]["businessModel"],
        pitchFocus: String(commercial.pitchFocus).trim(),
      },
    },
  };
}
