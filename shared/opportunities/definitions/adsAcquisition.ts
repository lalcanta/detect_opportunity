import { defineOpportunity, PHONE_OR_EMAIL } from "../types";

/** Preuve : démo de site en attendant le générateur de score Ads (docs/PLAN_REFONTE_LEADS.md §7). */
export const adsAcquisition = defineOpportunity({
  id: "ads_acquisition",
  status: "draft",
  label: "Publicité et acquisition",
  badge: { text: "Publicité", tone: "purple" },
  icon: "zap",
  requirements: { website: "required", contacts: PHONE_OR_EMAIL },
  channels: ["phone", "email"],
  scanModules: ["trackers_cmp", "ads_pixel_spy", "perf_mobile", "freshness_ssl", "contacts_legal", "social_links", "dirigeant_sirene", "branding_visual"],
  proof: { kind: "demo_web", generator: "llm_demo", focus: "ads_acquisition", interestCta: "Ce design me plaît, on en discute" },
  pitch: { phone: "llm_phone_battlecard", email: "llm_cold_email" },
  flyer: false,
  commercial: {
    businessModel: "recurring",
    pitchFocus: "Acquisition de chantiers par publicité ciblée",
  },
});
