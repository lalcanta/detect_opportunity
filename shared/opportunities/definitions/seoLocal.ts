import { defineOpportunity } from "../types";

export const seoLocal = defineOpportunity({
  id: "seo_local",
  status: "active",
  label: "Visibilité & SEO Local (Maps)",
  badge: { text: "📍 SEO Local", tone: "emerald" },
  icon: "map-pin",
  channels: ["phone"],
  scanModules: ["perf_mobile", "freshness_ssl", "ads_pixel_spy", "tech_stack", "contacts_legal", "social_links", "dirigeant_sirene", "branding_visual"],
  proof: { kind: "demo_web", generator: "llm_demo", focus: "seo_local", interestCta: "✅ Ce design me plaît, on en discute" },
  pitch: { kind: "phone_battlecard", generator: "llm_phone_battlecard" },
  flyer: true,
  commercial: {
    businessModel: "recurring",
    pitchFocus: "Positionnement en tête de Google Maps",
  },
});
