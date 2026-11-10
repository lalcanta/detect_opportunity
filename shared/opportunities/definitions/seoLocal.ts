import { defineOpportunity, PHONE_OR_EMAIL } from "../types";

/** Preuve : démo de site en attendant le générateur de score SEO (docs/PLAN_REFONTE_LEADS.md §7). */
export const seoLocal = defineOpportunity({
  id: "seo_local",
  status: "active",
  label: "Visibilité & SEO Local (Maps)",
  badge: { text: "📍 SEO Local", tone: "emerald" },
  icon: "map-pin",
  requirements: { website: "optional", contacts: PHONE_OR_EMAIL },
  channels: ["phone", "email"],
  scanModules: ["perf_mobile", "freshness_ssl", "ads_pixel_spy", "tech_stack", "contacts_legal", "social_links", "dirigeant_sirene", "branding_visual"],
  proof: { kind: "demo_web", generator: "llm_demo", focus: "seo_local", interestCta: "✅ Ce design me plaît, on en discute" },
  pitch: { phone: "llm_phone_battlecard", email: "llm_cold_email" },
  flyer: false,
  commercial: {
    businessModel: "recurring",
    pitchFocus: "Positionnement en tête de Google Maps",
  },
});
