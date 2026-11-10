/**
 * Qualification d'un lead selon les prérequis de son opportunité (docs/PLAN_REFONTE_LEADS.md §3.3).
 *
 * Deux étapes :
 * - `maps` : seuls le téléphone et la présence d'un site sont connus. L'email et le formulaire ne seront trouvés
 *   qu'en inspectant le site : ils sont « possibles » si le prospect a un site.
 * - `final` : après l'inspection, tout est connu.
 */
import type { ChannelId, OpportunityDefinition, PitchGeneratorId, WebsiteRequirement } from "./types";

export type QualificationStage = "maps" | "final";

/** Ce que l'on sait du prospect. `email` et `contactForm` sont ignorés à l'étape `maps`. */
export interface ContactAvailability {
  phone: boolean;
  website: boolean;
  email?: boolean;
  contactForm?: boolean;
}

export type RejectionReason =
  | "website_required"
  | "website_forbidden"
  | `missing_${ChannelId}`
  | `missing_any_of:${string}`;

export interface QualificationResult {
  qualified: boolean;
  reasons: RejectionReason[];
  /** Premier canal disponible dans l'ordre de l'opportunité ; `null` à l'étape `maps` si encore inconnu. */
  primaryChannel: ChannelId | null;
  /** Canaux disponibles, dans l'ordre de l'opportunité. */
  availableChannels: ChannelId[];
}

type TriState = "yes" | "no" | "unknown";

function channelState(channel: ChannelId, a: ContactAvailability, stage: QualificationStage): TriState {
  if (channel === "phone") return a.phone ? "yes" : "no";
  const known = channel === "email" ? a.email : a.contactForm;
  if (stage === "final") return known ? "yes" : "no";
  // Étape Maps : email et formulaire se trouvent sur le site.
  if (known) return "yes";
  return a.website ? "unknown" : "no";
}

export function evaluateRequirements(
  def: Pick<OpportunityDefinition, "requirements" | "channels">,
  availability: ContactAvailability,
  stage: QualificationStage,
): QualificationResult {
  const reasons: RejectionReason[] = [];
  const { website, contacts } = def.requirements;

  if (website === "required" && !availability.website) reasons.push("website_required");
  if (website === "forbidden" && availability.website) reasons.push("website_forbidden");

  for (const channel of contacts.allOf ?? []) {
    if (channelState(channel, availability, stage) === "no") reasons.push(`missing_${channel}`);
  }
  const anyOf = contacts.anyOf ?? [];
  if (anyOf.length > 0 && anyOf.every((c) => channelState(c, availability, stage) === "no")) {
    reasons.push(`missing_any_of:${anyOf.join("|")}`);
  }

  const availableChannels = def.channels.filter((c) => channelState(c, availability, stage) === "yes");
  return { qualified: reasons.length === 0, reasons, primaryChannel: availableChannels[0] ?? null, availableChannels };
}

/** Une qualification à l'étape Maps est-elle définitive, ou faut-il inspecter le site pour conclure ? */
export function needsInspectionToQualify(def: Pick<OpportunityDefinition, "requirements">): boolean {
  const { allOf = [], anyOf = [] } = def.requirements.contacts;
  return [...allOf, ...anyOf].some((c) => c !== "phone");
}

const CHANNEL_NAMES: Record<ChannelId, string> = { phone: "téléphone", email: "email", contact_form: "formulaire de contact" };

/** Raison de rejet lisible, pour les journaux de scan. */
export function describeRejection(reason: RejectionReason): string {
  if (reason === "website_required") return "pas de site web (exigé)";
  if (reason === "website_forbidden") return "a déjà un site web (exclu)";
  if (reason.startsWith("missing_any_of:")) {
    const list = reason.slice("missing_any_of:".length).split("|") as ChannelId[];
    return `aucun contact parmi : ${list.map((c) => CHANNEL_NAMES[c] ?? c).join(", ")}`;
  }
  const channel = reason.slice("missing_".length) as ChannelId;
  return `pas de ${CHANNEL_NAMES[channel] ?? channel}`;
}

export type WebsiteFilter = "all" | "no_website" | "has_website";

const FILTER_BY_REQUIREMENT: Record<WebsiteRequirement, WebsiteFilter> = {
  required: "has_website",
  forbidden: "no_website",
  optional: "all",
};

/**
 * Filtre de site d'un scan : celui de l'opportunité par défaut ; l'admin peut seulement le restreindre.
 * Renvoie une erreur si le filtre demandé contredit l'opportunité (ex. « sans site » pour un audit de site).
 */
export function resolveWebsiteFilter(
  def: Pick<OpportunityDefinition, "requirements">,
  requested?: string | null,
): { filter: WebsiteFilter; error?: string } {
  const forced = FILTER_BY_REQUIREMENT[def.requirements.website];
  const wanted: WebsiteFilter | null =
    requested === "all" || requested === "no_website" || requested === "has_website" ? requested : null;
  if (!wanted || wanted === "all") return { filter: forced };
  if (forced === "all" || forced === wanted) return { filter: wanted };
  return {
    filter: forced,
    error:
      def.requirements.website === "required"
        ? "Cette opportunité exige un site web : le filtre « sans site » est incompatible."
        : "Cette opportunité exclut les prospects qui ont un site : le filtre « avec site » est incompatible.",
  };
}

/** Générateur de message du canal principal d'un lead (ou du premier canal de l'opportunité). */
export function pitchGeneratorFor(
  def: Pick<OpportunityDefinition, "pitch" | "channels">,
  primaryChannel?: ChannelId | null,
): PitchGeneratorId {
  const channel = primaryChannel && def.channels.includes(primaryChannel) ? primaryChannel : def.channels[0];
  const generator = channel ? def.pitch[channel] : undefined;
  if (!generator) throw new Error(`Aucun générateur de message pour le canal ${channel ?? "?"}`);
  return generator;
}

export function isChannelId(value: unknown): value is ChannelId {
  return value === "phone" || value === "email" || value === "contact_form";
}
