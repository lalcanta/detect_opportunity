/**
 * Libellés et descriptions des briques d'un besoin, pour l'onglet admin « Besoins » (fiche, graphe, formulaire).
 * Les `Record<…Id, …>` garantissent à la compilation qu'aucune brique du code n'est oubliée.
 */
import type {
  BadgeTone,
  BusinessModel,
  ChannelId,
  DemoFocus,
  OpportunityStatus,
  PitchGeneratorId,
  ScanModuleId,
  WebsiteRequirement,
} from "./types";

export interface CatalogEntry {
  label: string;
  description: string;
}

export const SCAN_MODULE_CATALOG: Record<ScanModuleId, CatalogEntry> = {
  branding_visual: { label: "Logo, couleurs et capture", description: "Récupère le logo, les couleurs dominantes, les photos et une capture de la page d'accueil." },
  contacts_legal: { label: "Email et mentions légales", description: "Cherche les emails et le nom du dirigeant sur l'accueil, la page contact et les mentions légales." },
  contact_form: { label: "Formulaire de contact", description: "Repère un formulaire de contact utilisable et ses champs." },
  social_links: { label: "Réseaux sociaux", description: "Relève les liens Facebook, Instagram, LinkedIn… présents sur le site." },
  dirigeant_sirene: { label: "Dirigeant (SIRENE)", description: "Retrouve le SIREN et le dirigeant dans la base SIRENE." },
  perf_mobile: { label: "Affichage mobile", description: "Vérifie l'affichage sur téléphone (390 px) et les débordements." },
  freshness_ssl: { label: "HTTPS et fraîcheur", description: "Contrôle le certificat HTTPS, l'année du copyright et les images cassées." },
  tech_stack: { label: "Technologie du site", description: "Détecte le CMS ou le constructeur (WordPress, Wix, Shopify…)." },
  ads_pixel_spy: { label: "Pixels publicitaires", description: "Détecte les pixels Google Ads, Meta, TikTok…" },
  trackers_cmp: { label: "Traceurs avant consentement", description: "Mesure les traceurs tiers déclenchés avant l'accord du bandeau cookies (RGPD)." },
};

export const CHANNEL_CATALOG: Record<ChannelId, CatalogEntry> = {
  phone: { label: "Téléphone", description: "Numéro de la fiche Google Maps : appel par un closer." },
  email: { label: "Email", description: "Adresse trouvée sur le site : email d'approche." },
  contact_form: { label: "Formulaire", description: "Formulaire du site : message collé par le closer." },
};

export const WEBSITE_REQUIREMENT_CATALOG: Record<WebsiteRequirement, CatalogEntry> = {
  required: { label: "Site exigé", description: "Seuls les prospects qui ont un site sont retenus." },
  forbidden: { label: "Sans site", description: "Seuls les prospects sans site sont retenus : pas d'inspection." },
  optional: { label: "Site facultatif", description: "Avec ou sans site ; le site est inspecté s'il existe." },
};

export const PITCH_GENERATOR_CATALOG: Record<PitchGeneratorId, CatalogEntry> = {
  llm_phone_battlecard: { label: "Script d'appel", description: "Accroche, arguments et réponses aux objections, rédigés par le modèle." },
  llm_cold_email: { label: "Email rédigé", description: "Email d'approche personnalisé, rédigé par le modèle." },
  tracker_cold_email: { label: "Email d'audit", description: "Email qui cite les traceurs mesurés et le lien du rapport." },
};

export const PROOF_CATALOG: Record<"demo_web" | "audit_report", CatalogEntry> = {
  demo_web: { label: "Démo de site", description: "Site de démonstration personnalisé, hébergé et suivi." },
  audit_report: { label: "Rapport d'audit", description: "Rapport des traceurs mesurés, sans modèle de langage." },
};

export const DEMO_FOCUS_CATALOG: Record<DemoFocus, CatalogEntry> = {
  showcase: { label: "Vitrine", description: "Site vitrine complet du métier." },
  reviews: { label: "Avis Google", description: "Met en avant la collecte d'avis et la note." },
  seo_local: { label: "Référencement local", description: "Met en avant la visibilité sur Google Maps." },
  ads_acquisition: { label: "Publicité", description: "Page de conversion pour du trafic payant." },
};

export const STATUS_CATALOG: Record<OpportunityStatus, CatalogEntry> = {
  active: { label: "Actif", description: "Proposé au lancement d'un scan." },
  draft: { label: "Brouillon", description: "Défini mais pas proposé au scan." },
  archived: { label: "Archivé", description: "Retiré ; les anciens leads le gardent." },
};

export const BUSINESS_MODEL_CATALOG: Record<BusinessModel, CatalogEntry> = {
  one_shot: { label: "Ponctuel", description: "Une prestation facturée une fois." },
  recurring: { label: "Récurrent", description: "Un abonnement." },
  both: { label: "Les deux", description: "Prestation puis abonnement." },
};

export const BADGE_TONE_CATALOG: Record<BadgeTone, CatalogEntry> = {
  blue: { label: "Bleu", description: "" },
  cyan: { label: "Cyan", description: "" },
  amber: { label: "Ambre", description: "" },
  emerald: { label: "Vert", description: "" },
  purple: { label: "Violet", description: "" },
  zinc: { label: "Gris", description: "" },
};
