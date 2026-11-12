import { defineOpportunity, PHONE_ONLY } from "../types";

/** Refonte d'un site existant : le site est inspecté (charte, mobile, fraîcheur) et l'email peut servir de second canal. */
export const websiteRedesign = defineOpportunity({
  id: "website_redesign",
  status: "active",
  label: "Refonte de site",
  badge: { text: "Refonte de site", tone: "blue" },
  icon: "globe",
  requirements: { website: "required", contacts: PHONE_ONLY },
  channels: ["phone", "email"],
  scanModules: ["branding_visual", "perf_mobile", "freshness_ssl", "ads_pixel_spy", "contacts_legal", "social_links", "dirigeant_sirene", "tech_stack"],
  proof: { kind: "demo_web", generator: "llm_demo", focus: "showcase", interestCta: "Ce site me plaît, on en discute" },
  pitch: { phone: "llm_phone_battlecard", email: "llm_cold_email" },
  flyer: false,
  commercial: {
    businessModel: "one_shot",
    pitchFocus: "Site actuel daté ou peu efficace sur mobile : refonte moderne orientée appels et demandes de devis",
  },
});
