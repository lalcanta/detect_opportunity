/**
 * Libellés et descriptions des briques d'un besoin, pour l'onglet admin « Besoins » (fiche, graphe, formulaire).
 * Les `Record<…Id, …>` garantissent à la compilation qu'aucune brique du code n'est oubliée.
 */
import type {
  BadgeTone,
  BusinessModel,
  ChannelId,
  ComplementDemoMode,
  DemoFocus,
  DemoHighlight,
  MessageTone,
  OpportunityStatus,
  PitchGeneratorId,
  ProofKind,
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
  seo_onpage: { label: "Référencement du site", description: "Lit le titre, la description, le H1, les données structurées et le téléphone de la page d'accueil." },
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

export const PROOF_CATALOG: Record<ProofKind, CatalogEntry> = {
  demo_web: { label: "Démo de site", description: "Site de démonstration personnalisé, hébergé et suivi." },
  audit_report: { label: "Rapport d'audit", description: "Rapport des traceurs mesurés, sans modèle de langage." },
  visibility_report: { label: "Bilan de visibilité", description: "Position sur Google Maps, avis, fiche et site face aux concurrents, sans modèle de langage." },
  acquisition_report: { label: "Bilan d'acquisition", description: "Suivi des conversions, pixels et page d'arrivée face aux concurrents, sans modèle de langage." },
};

export const COMPLEMENT_DEMO_CATALOG: Record<ComplementDemoMode, CatalogEntry> = {
  auto: { label: "Automatique", description: "Démo de site jointe au bilan quand le prospect n'a pas de site, ou que le site est lent, mal adapté au mobile ou mal référencé (visibilité) / sans numéro cliquable ni formulaire (acquisition)." },
  always: { label: "Toujours", description: "Démo de site jointe à chaque bilan." },
  never: { label: "Jamais", description: "Bilan seul." },
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

/** Éléments à mettre en avant dans une démo : `instruction` est ajoutée telle quelle à la consigne de génération. */
export const DEMO_HIGHLIGHT_CATALOG: Record<DemoHighlight, CatalogEntry & { instruction: string }> = {
  quote_form: { label: "Devis express", description: "Formulaire de demande de devis court.", instruction: "un formulaire de devis express très visible (3 à 4 champs)" },
  online_booking: { label: "Prise de rendez-vous", description: "Créneaux à réserver en ligne.", instruction: "un module de prise de rendez-vous en ligne (choix du jour et du créneau, sans paiement)" },
  gallery: { label: "Galerie de réalisations", description: "Photos des chantiers ou des produits.", instruction: "une galerie de réalisations filtrable, avec les vraies photos du prospect si disponibles" },
  before_after: { label: "Avant / après", description: "Comparateur glissant.", instruction: "un comparateur avant / après à curseur glissant" },
  menu: { label: "Menu ou carte", description: "Carte, plats, formules.", instruction: "une carte (menu) lisible sur mobile, sans prix inventés" },
  service_area: { label: "Zone d'intervention", description: "Villes et rayon couverts.", instruction: "la zone d'intervention autour de la ville du prospect (liste des communes proches ou carte stylisée)" },
  emergency: { label: "Urgence", description: "Bandeau d'intervention rapide.", instruction: "un bandeau d'urgence avec appel direct, sans promettre de délai non fourni" },
  reviews_wall: { label: "Mur d'avis", description: "Avis Google mis en scène.", instruction: "un mur d'avis Google mis en scène avec la note réelle (aucun avis inventé)" },
  team: { label: "Équipe et savoir-faire", description: "Présentation de l'artisan.", instruction: "une section équipe et savoir-faire, avec des emplacements « à compléter » pour les faits non fournis" },
  faq: { label: "FAQ", description: "Questions fréquentes du métier.", instruction: "une FAQ dépliable avec les questions fréquentes du métier" },
  whatsapp: { label: "WhatsApp", description: "Bouton de discussion directe.", instruction: "un bouton WhatsApp flottant vers le numéro du prospect" },
  price_simulator: { label: "Simulateur", description: "Estimation interactive, sans prix ferme.", instruction: "un simulateur interactif d'estimation qui aboutit à une demande de devis (aucun prix ferme affiché)" },
};

/** Ton des messages : `instruction` est ajoutée aux consignes du script d'appel et de l'email. */
export const MESSAGE_TONE_CATALOG: Record<MessageTone, CatalogEntry & { instruction: string }> = {
  warm: { label: "Chaleureux", description: "Proche, simple, de voisin à voisin.", instruction: "Ton chaleureux et simple, de professionnel local à professionnel local." },
  direct: { label: "Direct", description: "Court, concret, va droit au but.", instruction: "Ton direct : phrases courtes, un seul argument fort, appel à l'action clair." },
  expert: { label: "Expert", description: "Factuel, s'appuie sur les constats.", instruction: "Ton d'expert : factuel, appuyé sur les constats mesurés, sans jargon inutile." },
};

/** Textes proposés pour le bouton d'intérêt de la démo, pour éviter la saisie. */
export const INTEREST_CTA_PRESETS: readonly string[] = [
  "Ce site me plaît, on en discute",
  "Ce design me plaît, on en discute",
  "Je veux être rappelé",
  "Ce rapport m'intéresse",
  "Je veux améliorer ma visibilité, on en parle",
  "Je veux en discuter",
];

/** Paliers proposés pour les critères de la fiche Maps. */
export const LISTING_STEPS = {
  rating: [3, 3.5, 4, 4.5],
  reviews: [5, 10, 20, 50, 100],
} as const;

/** Consigne « éléments à mettre en avant » d'une démo, ou chaîne vide. */
export function demoHighlightsInstruction(highlights: readonly DemoHighlight[] | undefined): string {
  const items = (highlights ?? []).map((h) => DEMO_HIGHLIGHT_CATALOG[h]?.instruction).filter(Boolean);
  if (!items.length) return "";
  return `ÉLÉMENTS À METTRE EN AVANT (choisis pour ce besoin, tous obligatoires) : ${items.join(" ; ")}.`;
}

/** Consigne de ton des messages, ou chaîne vide. */
export function messageToneInstruction(tone: MessageTone | undefined): string {
  return tone ? MESSAGE_TONE_CATALOG[tone]?.instruction ?? "" : "";
}
