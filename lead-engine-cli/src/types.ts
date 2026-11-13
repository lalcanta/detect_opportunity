export interface Review {
  author: string;
  rating: number | null;
  text: string;
  relativeDate: string;
}

/** Fiche voisine vue dans la même recherche Maps (données publiques de la liste). */
export interface MapsCompetitor {
  name: string;
  rank: number;
  rating: number | null;
  reviewsCount: number | null;
  website: string | null;
  category: string | null;
}

export interface MapsLead {
  name: string;
  activity: string;
  city: string;
  phone: string | null;
  website: string | null;
  /** Lien de la fiche qui n'est pas un site propre (réseau social, annuaire) ; non inspecté. */
  listingUrl?: string | null;
  rating: number | null;
  reviewsCount: number | null;
  recentReviews: Review[];
  mapsUrl: string;
  /** ChIJ... si trouvé, sert au QR code du formulaire d'avis */
  placeId: string | null;
  /** Rang de la fiche dans la recherche Maps (1 = première affichée) */
  mapsRank?: number | null;
  /** Recherche Maps telle qu'elle a été lancée */
  mapsQuery?: string | null;
  /** Date du constat (ISO) */
  mapsCheckedAt?: string | null;
  competitors?: MapsCompetitor[];
}

export interface TrackerRequest {
  name: string;
  category: "analytics" | "advertising" | "heatmap_ux" | "tag_manager" | "chat_crm";
  url: string;
}

export interface ContactFormInfo {
  /** Page où le formulaire a été trouvé */
  url: string;
  /** Noms des champs visibles (name, id ou placeholder) */
  fields: string[];
  /** Protection anti-bot détectée (reCAPTCHA, hCaptcha, Turnstile…) */
  captcha: string | null;
  /** Case de consentement RGPD présente dans le formulaire */
  hasConsentCheckbox: boolean;
  /** Formulaire tiers embarqué (Typeform, HubSpot…), sinon null */
  provider: string | null;
}

export interface SiteInspection {
  url: string;
  title?: string | null;
  loadTimeMs: number | null;
  isResponsive: boolean | null;
  dominantColors: string[];
  logoUrl: string | null;
  /** Capture pleine page, gardée en mémoire uniquement */
  screenshot: Buffer | null;
  /** Emails extraits de l'accueil, /contact ou /mentions-legales */
  emails?: string[];
  /** Dirigeants / directeurs de publication extraits des mentions légales */
  keyPeople?: string[];
  /** Technologies détectées (Webflow, GSAP, Tailwind CSS, Next.js, WordPress...) */
  stack?: string[];
  /** Traceurs réseau déclenchés à froid avant tout consentement CMP */
  trackersFound?: string[];
  /** Détail des requêtes réseau des traceurs interceptés */
  trackerRequests?: TrackerRequest[];
  /** Bandeau cookies / CMP détecté sur la page (Axeptio, Didomi, Cookiebot...) */
  cmpDetected?: string | null;
  /** Liens réseaux sociaux détectés passivement sur le site (LinkedIn, Facebook, Instagram) */
  socialLinks?: {
    linkedin: string[];
    facebook: string[];
    instagram: string[];
  };
  /** Numéro SIREN officiel (9 chiffres) via API Annuaire des Entreprises */
  siren?: string | null;
  /** Date de création officielle de la société (YYYY-MM-DD) */
  companyCreatedAt?: string | null;
  /** Pixels publicitaires payants détectés (Google Ads AW-xxx, Meta Pixel, TikTok Pixel, LinkedIn Ads...) */
  paidAdsDetected?: string[];
  /** Indique si l'URL finale est servie en HTTPS (true) ou HTTP non sécurisé (false) */
  isHttps?: boolean | null;
  /** Année de copyright la plus récente trouvée dans le pied de page (ex: 2019) */
  copyrightYear?: number | null;
  /** Signaux concrets d'obsolescence ou de négligence technique (HTTP non sécurisé, copyright ancien, images cassées) */
  obsolescenceSignals?: string[];
  /** Vraies photos trouvées sur le site (réalisations, boutique, produits), les plus grandes d'abord */
  siteImages?: string[];
  /** Formulaire de contact exploitable (vérification contact_form) ; null si cherché sans succès */
  contactForm?: ContactFormInfo | null;
  error?: string;
}

export interface SiteAudit {
  summary: string;
  weaknesses: string[];
  score: number;
}

export interface Objection {
  objection: string;
  reply: string;
}

export interface ColdEmail {
  subject: string;
  body: string;
  reportUrl?: string;
  trackersFound?: string[];
  techStack?: string[];
}

export interface Battlecard {
  /** Petit laïus pour le closer : contexte du prospect et pourquoi notre solution surpasse la leur */
  closerBrief?: string;
  /** Liste des avantages concrets de notre solution par rapport à l'existant du prospect */
  ourAdvantages?: string[];
  callScript?: string;
  objections?: Objection[];
  whatsappText?: string;
  coldEmail?: ColdEmail;
}

export interface TokenUsageRecord {
  task: string;
  model: string;
  /** Modèle configuré, quand `model` est un repli */
  requestedModel?: string;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
}

export interface SyncPayload {
  id: string;
  company_name: string;
  activity: string;
  city: string;
  phone: string | null;
  email?: string | null;
  website_url: string | null;
  google_rating: number | null;
  google_reviews_count: number | null;
  opportunity_type?: string | null;
  audit_data: Record<string, unknown>;
  demo_html?: string | null;
  flyer_pdf_base64?: string | null;
  battlecard_data?: Battlecard | null;
  token_usage?: TokenUsageRecord[];
  status?: string | null;
  /** Date du scan (ISO) : date de création du lead dans le CRM */
  scanned_at?: string;
  /** Canal principal du lead selon son opportunité (phone | email | contact_form) */
  primary_channel?: string | null;
  /** Contacts trouvés, enregistrés dans lead_contacts */
  contacts?: LeadContact[];
}

export interface LeadContact {
  kind: "phone" | "email" | "contact_form";
  value: string;
  source: "maps" | "site" | "sirene" | "inbound" | "manual";
  /** 0..1 */
  confidence?: number | null;
  /** Détails (ex. captcha et champs d'un formulaire) */
  meta?: Record<string, unknown> | null;
  is_primary?: boolean;
}
