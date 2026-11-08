export interface Review {
  author: string;
  rating: number | null;
  text: string;
  relativeDate: string;
}

export interface MapsLead {
  name: string;
  activity: string;
  city: string;
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviewsCount: number | null;
  recentReviews: Review[];
  mapsUrl: string;
  /** ChIJ... si trouvé, sert au QR code du formulaire d'avis */
  placeId: string | null;
}

export interface TrackerRequest {
  name: string;
  category: "analytics" | "advertising" | "heatmap_ux" | "tag_manager" | "chat_crm";
  url: string;
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
}
