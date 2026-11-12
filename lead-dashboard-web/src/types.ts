import {
  ALL_OPPORTUNITY_IDS,
  OPPORTUNITIES,
  onOpportunitiesChange,
  isOpportunityId,
  opportunityIdOf,
  pitchGeneratorFor,
  PITCH_KIND_BY_GENERATOR,
  type ChannelId,
  type BadgeTone,
  type BusinessModel,
  type OpportunityDefinition as SharedOpportunityDefinition,
  type OpportunityId,
} from "../../shared/opportunities";

export type Role = "admin" | "closer";

export const LEAD_STATUSES = ["demo_ready", "hot_lead", "called", "won", "lost", "callback_scheduled"] as const;
/** `pending_generation` : en attente de démo ; `unqualified` : prérequis de l'opportunité non remplis (hors Kanban). */
export type LeadStatus = (typeof LEAD_STATUSES)[number] | "pending_generation" | "unqualified";

export interface Bindings {
  DB: D1Database;
  AI?: any;
  SYNC_SECRET_TOKEN: string;
  PUBLIC_APP_URL?: string;
  GEMINI_API_KEY?: string;
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  DISCORD_WEBHOOK_URL?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_AMOUNT_CENTS?: string;
  STRIPE_PRODUCT_NAME?: string;
  AUTO_ASSIGN?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REDIRECT_URI?: string;
}

export interface AvailableModel {
  id: number;
  provider: string;
  model_id: string;
  display_name: string;
  description: string | null;
  supports_vision: number;
  supports_thinking: number;
  is_flagship?: number;
  speed?: string | null;
  cost_tier?: string | null;
  context_window?: string | null;
  recommended_for?: string | null;
  updated_at: string;
}

export interface User {
  id: string;
  name: string;
  email?: string | null;
  password_hash?: string | null;
  invite_code?: string | null;
  invited_at?: string | null;
  role: Role;
  is_active: number;
  phone_quota_weekly: number;
  google_email?: string | null;
  google_calendar_id?: string | null;
  allowed_opportunities?: string | null;
  /** JSON des canaux que le closer traite (phone, email, contact_form) ; absent = tous */
  allowed_channels?: string | null;
}

/** Canaux autorisés d'un closer : liste JSON valide, sinon tous les canaux. */
export function parseAllowedChannels(raw?: string | null): ChannelId[] {
  const all: ChannelId[] = ["phone", "email", "contact_form"];
  if (!raw) return all;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const valid = parsed.filter((c): c is ChannelId => all.includes(c));
      if (valid.length > 0) return valid;
    }
  } catch {
    // valeur illisible : tous les canaux
  }
  return all;
}

// Les opportunités sont définies dans shared/opportunities (source unique pour le CLI et le dashboard).
// Ce module en dérive la vue utilisée par les écrans et le JavaScript client.
export type OpportunityChannel = "vocal_closer" | "async_email";
export type { BusinessModel, BadgeTone } from "../../shared/opportunities";

export interface OpportunityDefinition {
  id: string;
  status: "active" | "draft" | "archived";
  label: string;
  badge: string;
  tone: BadgeTone;
  icon: string;
  /** Mode par défaut de l'écran du closer, déduit du premier canal de l'opportunité. */
  channel: OpportunityChannel;
  /** Canaux par ordre de préférence ; celui d'un lead est dans `leads.primary_channel`. */
  channels: ChannelId[];
  websiteRequirement: "required" | "forbidden" | "optional";
  /** Prérequis de contact en clair (ex. « email ou formulaire de contact »). */
  contactRequirement: string;
  businessModel: BusinessModel;
  proofType: "demo_web" | "audit_report";
  pitchType: "phone_battlecard" | "cold_email";
  pitchFocus: string;
}

export function toOpportunityView(def: SharedOpportunityDefinition): OpportunityDefinition {
  return {
    id: def.id,
    status: def.status,
    label: def.label,
    badge: def.badge.text,
    tone: def.badge.tone,
    icon: def.icon,
    channel: def.channels[0] === "phone" ? "vocal_closer" : "async_email",
    businessModel: def.commercial.businessModel,
    proofType: def.proof.kind,
    pitchType: PITCH_KIND_BY_GENERATOR[pitchGeneratorFor(def)],
    channels: [...def.channels],
    websiteRequirement: def.requirements.website,
    contactRequirement: describeContactRequirement(def),
    pitchFocus: def.commercial.pitchFocus,
  };
}

const CONTACT_NAMES: Record<ChannelId, string> = { phone: "téléphone", email: "email", contact_form: "formulaire de contact" };

export function describeContactRequirement(def: Pick<SharedOpportunityDefinition, "requirements">): string {
  const { allOf = [], anyOf = [] } = def.requirements.contacts;
  const parts: string[] = [];
  if (allOf.length) parts.push(allOf.map((c) => CONTACT_NAMES[c]).join(" et "));
  if (anyOf.length) parts.push(anyOf.map((c) => CONTACT_NAMES[c]).join(" ou "));
  return parts.join(", et ");
}

/** Vue des définitions en vigueur ; mise à jour sur place à chaque chargement depuis la base (onOpportunitiesChange). */
export const OPPORTUNITY_TYPES: OpportunityDefinition[] = OPPORTUNITIES.map(toOpportunityView);

/** Opportunités proposées au lancement d'un scan (ni brouillon ni archivée). */
export const SCANNABLE_OPPORTUNITY_TYPES: OpportunityDefinition[] = OPPORTUNITY_TYPES.filter((o) => o.status === "active");

onOpportunitiesChange(() => {
  OPPORTUNITY_TYPES.splice(0, OPPORTUNITY_TYPES.length, ...OPPORTUNITIES.map(toOpportunityView));
  SCANNABLE_OPPORTUNITY_TYPES.splice(0, SCANNABLE_OPPORTUNITY_TYPES.length, ...OPPORTUNITY_TYPES.filter((o) => o.status === "active"));
});

export type OpportunityTypeId = OpportunityId;

export function getOpportunity(id?: string | null): OpportunityDefinition {
  const found = OPPORTUNITY_TYPES.find((o) => o.id === opportunityIdOf(id));
  if (found) return found;
  return {
    id: id || "custom",
    status: "active",
    label: id || "Opportunité",
    badge: `🎯 ${id || "Opportunité"}`,
    tone: "zinc",
    icon: "target",
    channel: "async_email",
    channels: ["email"],
    websiteRequirement: "optional",
    contactRequirement: "au moins un contact",
    businessModel: "both",
    proofType: "audit_report",
    pitchType: "cold_email",
    pitchFocus: "Prestation personnalisée",
  };
}

export function parseAllowedOpportunities(raw?: string | null): OpportunityTypeId[] {
  const allIds = ALL_OPPORTUNITY_IDS;
  if (!raw) return allIds;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const valid = parsed.filter(isOpportunityId);
      return valid.length > 0 ? valid : allIds;
    }
  } catch {
    const parts = raw.split(",").map((s) => s.trim()).filter(isOpportunityId);
    if (parts.length > 0) return parts;
  }
  return allIds;
}

export interface LeadRow {
  id: string;
  company_name: string;
  activity: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  website_url: string | null;
  google_rating: number | null;
  google_reviews_count: number | null;
  audit_data: string | null;
  flyer_pdf_url: string | null;
  battlecard_data: string | null;
  assigned_to: string | null;
  assigned_at: string | null;
  locked_by: string | null;
  locked_until: string | null;
  demo_viewed_count: number;
  last_demo_viewed_at: string | null;
  demo_revoked?: number | null;
  demo_expires_at?: string | null;
  status: LeadStatus;
  callback_scheduled_at?: string | null;
  call_notes: string | null;
  google_calendar_event_id?: string | null;
  opportunity_type?: string | null;
  /** SIREN (9 chiffres) relevé à l'inspection, pour repérer les doublons */
  siren?: string | null;
  /** Provenance : « tâche|modèle|modèle demandé » séparés par « ; » (token_usage) */
  generated_by?: string | null;
  /** « Nom · Ville » d'un autre lead de même SIREN, s'il existe */
  duplicate_of?: string | null;
  /** Canal principal (phone | email | contact_form), null pour les leads antérieurs à la phase 1 */
  primary_channel?: string | null;
  /** URL du formulaire de contact (lead_contacts), si trouvé */
  contact_form_url?: string | null;
  /** JSON : captcha, champs, fournisseur du formulaire */
  contact_form_meta?: string | null;
  created_at: string;
  assignee_name?: string | null;
  locker_name?: string | null;
}

export interface Battlecard {
  closerBrief?: string;
  ourAdvantages?: string[];
  callScript?: string;
  objections?: { objection: string; reply: string }[];
  whatsappText?: string;
  coldEmail?: {
    subject: string;
    body: string;
    reportUrl?: string;
    trackersFound?: string[];
    techStack?: string[];
  };
}

export interface SyncBody {
  id: string;
  company_name: string;
  activity?: string;
  city?: string;
  phone?: string | null;
  email?: string | null;
  website_url?: string | null;
  google_rating?: number | null;
  google_reviews_count?: number | null;
  opportunity_type?: string | null;
  audit_data?: Record<string, unknown>;
  demo_html?: string | null;
  flyer_pdf_base64?: string | null;
  battlecard_data?: Battlecard | null;
  status?: LeadStatus | null;
  /** Canal principal du lead (phone | email | contact_form) */
  primary_channel?: string | null;
  /** Date du scan (ISO) : date de création du lead */
  scanned_at?: string | null;
  /** Contacts trouvés par le CLI, enregistrés dans lead_contacts */
  contacts?: unknown[];
  token_usage?: {
    task: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    thinkingTokens: number;
    /** Modèle configuré, quand le modèle utilisé est un repli */
    requestedModel?: string;
  }[];
}

export type AppEnv = { Bindings: Bindings; Variables: { user: User } };
