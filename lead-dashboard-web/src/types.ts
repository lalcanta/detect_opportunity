export type Role = "admin" | "closer";

export const LEAD_STATUSES = ["demo_ready", "hot_lead", "called", "won", "lost", "callback_scheduled"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number] | "pending_generation";

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
}

export type OpportunityChannel = "vocal_closer" | "async_email";
export type BusinessModel = "one_shot" | "recurring" | "both";
export type ProofType = "demo_web" | "audit_report" | "audit_score" | "none";
export type PitchType = "phone_battlecard" | "cold_email";

export interface OpportunityDefinition {
  id: string;
  label: string;
  badge: string;
  icon: string;
  channel: OpportunityChannel;
  businessModel: BusinessModel;
  proofType: ProofType;
  pitchType: PitchType;
  pitchFocus: string;
}

export const OPPORTUNITY_TYPES = [
  {
    id: "website",
    label: "Création / Refonte de Site Web",
    badge: "🌐 Site Web",
    icon: "globe",
    channel: "vocal_closer",
    businessModel: "one_shot",
    proofType: "demo_web",
    pitchType: "phone_battlecard",
    pitchFocus: "Présence web moderne, conversion mobile & Blueprint concurrentiel",
  },
  {
    id: "audit_qa_trackers",
    label: "Audit QA Régression & Traceurs RGPD",
    badge: "🛡️ Audit QA Traceurs",
    icon: "shield",
    channel: "async_email",
    businessModel: "recurring",
    proofType: "audit_report",
    pitchType: "cold_email",
    pitchFocus: "Détection fuites CMP / tags marketing avant consentement & filet CI/CD",
  },
  {
    id: "google_reviews",
    label: "E-Réputation & Avis Google",
    badge: "⭐ Avis Google",
    icon: "star",
    channel: "vocal_closer",
    businessModel: "one_shot",
    proofType: "none",
    pitchType: "phone_battlecard",
    pitchFocus: "Boost de note moyenne & flyers QR avis",
  },
  {
    id: "seo_local",
    label: "Visibilité & SEO Local (Maps)",
    badge: "📍 SEO Local",
    icon: "map-pin",
    channel: "vocal_closer",
    businessModel: "recurring",
    proofType: "audit_score",
    pitchType: "phone_battlecard",
    pitchFocus: "Positionnement en tête de Google Maps",
  },
  {
    id: "ads_acquisition",
    label: "Campagnes Ads & Acquisition",
    badge: "⚡ Ads Acquisition",
    icon: "zap",
    channel: "vocal_closer",
    businessModel: "recurring",
    proofType: "audit_score",
    pitchType: "phone_battlecard",
    pitchFocus: "Acquisition de chantiers par publicité ciblée",
  },
  {
    id: "custom",
    label: "Besoin Sur-Mesure",
    badge: "🎯 Sur-Mesure",
    icon: "target",
    channel: "async_email",
    businessModel: "both",
    proofType: "audit_report",
    pitchType: "cold_email",
    pitchFocus: "Offre personnalisée adaptée au prospect",
  },
] as const;

export type OpportunityTypeId = (typeof OPPORTUNITY_TYPES)[number]["id"];

export function getOpportunity(id?: string | null): OpportunityDefinition {
  const found = OPPORTUNITY_TYPES.find((o) => o.id === id);
  if (found) return found;
  return {
    id: id || "custom",
    label: id || "Opportunité",
    badge: `🎯 ${id || "Opportunité"}`,
    icon: "target",
    channel: "async_email",
    businessModel: "both",
    proofType: "audit_report",
    pitchType: "cold_email",
    pitchFocus: "Prestation personnalisée",
  };
}

export function parseAllowedOpportunities(raw?: string | null): OpportunityTypeId[] {
  const allIds = OPPORTUNITY_TYPES.map((o) => o.id);
  if (!raw) return allIds;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const valid = parsed.filter((id) => allIds.includes(id as OpportunityTypeId)) as OpportunityTypeId[];
      return valid.length > 0 ? valid : allIds;
    }
  } catch {
    const parts = raw.split(",").map((s) => s.trim()).filter((id) => allIds.includes(id as OpportunityTypeId)) as OpportunityTypeId[];
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
  token_usage?: {
    task: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    thinkingTokens: number;
  }[];
}

export type AppEnv = { Bindings: Bindings; Variables: { user: User } };
