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
  "seo_onpage",
  "dirigeant_sirene",
  "branding_visual",
  "perf_mobile",
  "contact_form",
] as const;
export type ScanModuleId = (typeof SCAN_MODULE_IDS)[number];

/** Canaux de contact d'un prospect. */
export const CHANNEL_IDS = ["phone", "email", "contact_form"] as const;
export type ChannelId = (typeof CHANNEL_IDS)[number];

/** Libellés courts des canaux, pour les journaux et l'interface. */
export const CHANNEL_LABELS: Record<ChannelId, string> = {
  phone: "📞 Téléphone",
  email: "✉️ Email",
  contact_form: "📝 Formulaire",
};

/**
 * Contacts exigés pour qu'un lead soit exploitable.
 * `allOf` : tous obligatoires ; `anyOf` : au moins un. Les deux peuvent être combinés.
 */
export interface ContactRequirement {
  allOf?: readonly ChannelId[];
  anyOf?: readonly ChannelId[];
}

export const PHONE_ONLY: ContactRequirement = { allOf: ["phone"] };
export const EMAIL_OR_FORM: ContactRequirement = { anyOf: ["email", "contact_form"] };
export const PHONE_OR_EMAIL: ContactRequirement = { anyOf: ["phone", "email"] };
export const ANY_CONTACT: ContactRequirement = { anyOf: ["phone", "email", "contact_form"] };

/** Présence d'un site exigée : donne aussi le filtre de site par défaut du scan. */
export type WebsiteRequirement = "required" | "forbidden" | "optional";

/**
 * Critères lus sur la fiche Maps, avant toute visite du site. Une fiche sans note ou sans avis connus n'est pas
 * écartée par un minimum, seulement par un maximum de 0 avis.
 */
export interface ListingCriteria {
  minRating?: number;
  maxRating?: number;
  minReviews?: number;
  maxReviews?: number;
}

export interface OpportunityRequirements {
  website: WebsiteRequirement;
  contacts: ContactRequirement;
  listing?: ListingCriteria;
}

export type BusinessModel = "one_shot" | "recurring" | "both";

/** Couleur du badge ; la correspondance avec les classes CSS est faite par le dashboard. */
export type BadgeTone = "blue" | "cyan" | "amber" | "emerald" | "purple" | "zinc";

/**
 * Angle de la démo de site, utilisé par la génération full_auto et par les consignes du mode prep (Antigravity).
 */
export type DemoFocus = "showcase" | "reviews" | "seo_local" | "ads_acquisition";

/** Éléments qu'une démo peut mettre en avant, choisis au clic dans l'onglet Besoins. */
export const DEMO_HIGHLIGHTS = [
  "quote_form",
  "online_booking",
  "gallery",
  "before_after",
  "menu",
  "service_area",
  "emergency",
  "reviews_wall",
  "team",
  "faq",
  "whatsapp",
  "price_simulator",
] as const;
export type DemoHighlight = (typeof DEMO_HIGHLIGHTS)[number];

/** Ton des messages (script d'appel et email). */
export const MESSAGE_TONES = ["warm", "direct", "expert"] as const;
export type MessageTone = (typeof MESSAGE_TONES)[number];

/** Générateurs de preuve implémentés dans lead-engine-cli. */
export const PROOF_GENERATOR_IDS = ["llm_demo", "tracker_report", "visibility_report", "acquisition_report"] as const;
export type ProofGeneratorId = (typeof PROOF_GENERATOR_IDS)[number];

export type ProofDefinition =
  | {
      /** Démo de site personnalisée (LLM en full_auto, agent en prep). */
      kind: "demo_web";
      generator: "llm_demo";
      focus: DemoFocus;
      /** Éléments à mettre en avant dans la démo (catalogue `DEMO_HIGHLIGHT_CATALOG`). */
      highlights?: readonly DemoHighlight[];
      /** Libellé du bouton d'intérêt affiché au prospect sur /demos/:id. */
      interestCta: string;
    }
  | {
      /** Rapport d'audit déterministe, sans LLM. */
      kind: "audit_report";
      generator: "tracker_report";
      interestCta: string;
    }
  | {
      /** Bilan de visibilité locale (position Maps, avis, fiche, site), déterministe. */
      kind: "visibility_report";
      generator: "visibility_report";
      interestCta: string;
    }
  | {
      /** Bilan d'acquisition (suivi, pixels, page d'arrivée, concurrents), déterministe. */
      kind: "acquisition_report";
      generator: "acquisition_report";
      interestCta: string;
    };

export type ProofKind = ProofDefinition["kind"];

/** Preuves « bilan », qui peuvent être suivies d'une démo de site complémentaire. */
export const REPORT_PROOF_KINDS = ["visibility_report", "acquisition_report"] as const;
export const isReportProof = (kind: ProofKind): kind is (typeof REPORT_PROOF_KINDS)[number] =>
  (REPORT_PROOF_KINDS as readonly string[]).includes(kind);

/**
 * Démo de site complémentaire d'un bilan : `auto` (défaut) la produit quand le site est en cause (règles dans
 * lead-engine-cli/src/opportunities/siteDemo.ts), `always` toujours, `never` jamais.
 */
export const COMPLEMENT_DEMO_MODES = ["auto", "always", "never"] as const;
export type ComplementDemoMode = (typeof COMPLEMENT_DEMO_MODES)[number];

/** Générateurs de message implémentés dans lead-engine-cli. */
export const PITCH_GENERATOR_IDS = ["llm_phone_battlecard", "llm_cold_email", "tracker_cold_email"] as const;
export type PitchGeneratorId = (typeof PITCH_GENERATOR_IDS)[number];

/** Forme du message : script d'appel + objections, ou email d'approche (aussi collé dans un formulaire). */
export type PitchKind = "phone_battlecard" | "cold_email";

export const PITCH_KIND_BY_GENERATOR: Record<PitchGeneratorId, PitchKind> = {
  llm_phone_battlecard: "phone_battlecard",
  llm_cold_email: "cold_email",
  tracker_cold_email: "cold_email",
};

/**
 * Générateur de message pour chaque canal de l'opportunité. Le message généré est celui du canal principal du lead.
 * En full_auto, le générateur est exécuté ; en prep, l'agent suit la consigne correspondante.
 */
export type PitchByChannel = Partial<Record<ChannelId, PitchGeneratorId>>;

export const OPPORTUNITY_STATUSES = ["active", "draft", "archived"] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export const BADGE_TONES = ["blue", "cyan", "amber", "emerald", "purple", "zinc"] as const;
export const BUSINESS_MODELS = ["one_shot", "recurring", "both"] as const;
export const DEMO_FOCUSES = ["showcase", "reviews", "seo_local", "ads_acquisition"] as const;
export const WEBSITE_REQUIREMENTS = ["required", "forbidden", "optional"] as const;

export interface OpportunityDefinition {
  id: string;
  /** `draft` : définie mais non proposée au scan ; `archived` : retirée, conservée pour les anciens leads. */
  status: OpportunityStatus;
  label: string;
  badge: { text: string; tone: BadgeTone };
  /** Nom d'icône (lucide). */
  icon: string;
  /** Contacts et site exigés pour qu'un lead soit qualifié. */
  requirements: OpportunityRequirements;
  /** Canaux de contact, par ordre de préférence : le premier disponible devient le canal principal du lead. */
  channels: readonly ChannelId[];
  /** Vérifications lancées pendant l'inspection du site. */
  scanModules: readonly ScanModuleId[];
  proof: ProofDefinition;
  /** Démo de site en complément d'un bilan ; absent = `auto`. Sans effet pour une autre preuve. */
  complementDemo?: ComplementDemoMode;
  pitch: PitchByChannel;
  /** Génère le flyer PDF (QR code vers le formulaire d'avis Google). */
  flyer: boolean;
  commercial: {
    businessModel: BusinessModel;
    /** Angle repris dans la consigne des messages ; le libellé du besoin s'il est laissé vide. */
    pitchFocus: string;
    tone?: MessageTone;
  };
}

/** Identité typée : permet de garder les littéraux tout en vérifiant le contrat. */
export function defineOpportunity<const T extends OpportunityDefinition>(def: T): T {
  return def;
}
