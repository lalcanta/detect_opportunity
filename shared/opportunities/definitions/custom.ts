import { ANY_CONTACT, defineOpportunity } from "../types";

export const custom = defineOpportunity({
  id: "custom",
  status: "active",
  label: "Besoin Sur-Mesure",
  badge: { text: "🎯 Sur-Mesure", tone: "zinc" },
  icon: "target",
  requirements: { website: "optional", contacts: ANY_CONTACT },
  channels: ["email", "contact_form", "phone"],
  scanModules: ["trackers_cmp", "ads_pixel_spy", "tech_stack", "freshness_ssl", "contacts_legal", "contact_form", "social_links", "dirigeant_sirene", "branding_visual", "perf_mobile"],
  proof: { kind: "demo_web", generator: "llm_demo", focus: "showcase", interestCta: "✅ Ce design me plaît, on en discute" },
  pitch: { email: "llm_cold_email", contact_form: "llm_cold_email", phone: "llm_phone_battlecard" },
  flyer: false,
  commercial: {
    businessModel: "both",
    pitchFocus: "Offre personnalisée adaptée au prospect",
  },
});
