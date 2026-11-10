/**
 * Contrat d'une opportunité commerciale, partagé par lead-engine-cli et lead-dashboard-web.
 *
 * Ce fichier doit rester pur : aucun import de Playwright, de Node ou des API Cloudflare,
 * pour être utilisable des deux côtés. Voir docs/PLAN_REFONTE_LEADS.md §3.1.
 */

/** Vérifications d'inspection de site disponibles (implémentées dans lead-engine-cli/src/inspector/modules). */
export const SCAN_MODULE_IDS = [
  "trackers_cmp",
  "ads_pixel_spy",
  "tech_stack",
  "freshness_ssl",
  "contacts_legal",
  "social_links",
  "dirigeant_sirene",
  "branding_visual",
  "perf_mobile",
] as const;
export type ScanModuleId = (typeof SCAN_MODULE_IDS)[number];

/** Canaux de contact. `contact_form` arrive en phase 1. */
export const CHANNEL_IDS = ["phone", "email"] as const;
export type ChannelId = (typeof CHANNEL_IDS)[number];

export type BusinessModel = "one_shot" | "recurring" | "both";

/** Couleur du badge ; la correspondance avec les classes CSS est faite par le dashboard. */
export type BadgeTone = "blue" | "cyan" | "amber" | "emerald" | "purple" | "zinc";

/**
 * Angle de la démo de site, utilisé par les consignes du mode prep (Antigravity).
 * Le mode full_auto ne s'en sert pas encore.
 */
export type DemoFocus = "showcase" | "reviews" | "seo_local" | "ads_acquisition";

/** Générateurs de preuve implémentés dans lead-engine-cli. */
export const PROOF_GENERATOR_IDS = ["llm_demo", "tracker_report"] as const;
export type ProofGeneratorId = (typeof PROOF_GENERATOR_IDS)[number];

export type ProofDefinition =
  | {
      /** Démo de site personnalisée (LLM en full_auto, agent en prep). */
      kind: "demo_web";
      generator: "llm_demo";
      focus: DemoFocus;
      /** Libellé du bouton d'intérêt affiché au prospect sur /demos/:id. */
      interestCta: string;
    }
  | {
      /** Rapport d'audit déterministe, sans LLM. */
      kind: "audit_report";
      generator: "tracker_report";
      interestCta: string;
    };

/** Générateurs de message implémentés dans lead-engine-cli. */
export const PITCH_GENERATOR_IDS = ["llm_phone_battlecard", "tracker_cold_email"] as const;
export type PitchGeneratorId = (typeof PITCH_GENERATOR_IDS)[number];

export interface PitchDefinition {
  /** Forme du message : script d'appel + objections, ou email d'approche. */
  kind: "phone_battlecard" | "cold_email";
  /** Générateur utilisé en full_auto. En prep, l'agent suit la consigne correspondante. */
  generator: PitchGeneratorId;
}

export interface OpportunityDefinition {
  id: string;
  /** `draft` : définie mais non proposée au scan. */
  status: "active" | "draft";
  label: string;
  badge: { text: string; tone: BadgeTone };
  /** Nom d'icône (lucide). */
  icon: string;
  /** Canaux de contact, par ordre de préférence. Le premier donne le mode de l'écran du closer. */
  channels: readonly ChannelId[];
  /** Vérifications lancées pendant l'inspection du site. */
  scanModules: readonly ScanModuleId[];
  proof: ProofDefinition;
  pitch: PitchDefinition;
  /** Génère le flyer PDF (QR code vers le formulaire d'avis Google). */
  flyer: boolean;
  commercial: {
    businessModel: BusinessModel;
    pitchFocus: string;
  };
}

/** Identité typée : permet de garder les littéraux tout en vérifiant le contrat. */
export function defineOpportunity<const T extends OpportunityDefinition>(def: T): T {
  return def;
}
