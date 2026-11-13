import { defineOpportunity, PHONE_OR_EMAIL } from "../types";

/** Preuve : bilan de visibilité locale, suivi d'une démo de site quand le site est en cause. */
export const seoLocal = defineOpportunity({
  id: "seo_local",
  status: "draft",
  label: "Référencement local",
  badge: { text: "Référencement local", tone: "purple" },
  icon: "map-pin",
  requirements: { website: "optional", contacts: PHONE_OR_EMAIL },
  channels: ["phone", "email"],
  scanModules: ["seo_onpage", "perf_mobile", "freshness_ssl", "ads_pixel_spy", "tech_stack", "contacts_legal", "social_links", "dirigeant_sirene", "branding_visual"],
  proof: { kind: "visibility_report", generator: "visibility_report", interestCta: "Je veux améliorer ma visibilité, on en parle" },
  complementDemo: "auto",
  pitch: { phone: "llm_phone_battlecard", email: "llm_cold_email" },
  flyer: false,
  commercial: {
    businessModel: "recurring",
    pitchFocus: "Positionnement en tête de Google Maps",
  },
});
