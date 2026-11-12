import { defineOpportunity, PHONE_ONLY } from "../types";

/** Premier site pour un artisan visible seulement sur Google Maps : pas de site, donc ni inspection ni email. */
export const websiteCreation = defineOpportunity({
  id: "website_creation",
  status: "active",
  label: "Création de site",
  badge: { text: "Création de site", tone: "emerald" },
  icon: "sparkles",
  requirements: { website: "forbidden", contacts: PHONE_ONLY },
  channels: ["phone"],
  scanModules: ["dirigeant_sirene"],
  proof: { kind: "demo_web", generator: "llm_demo", focus: "showcase", interestCta: "Ce site me plaît, on en discute" },
  pitch: { phone: "llm_phone_battlecard" },
  flyer: false,
  commercial: {
    businessModel: "one_shot",
    pitchFocus: "Premier site professionnel pour un artisan visible seulement sur Google Maps",
  },
});
