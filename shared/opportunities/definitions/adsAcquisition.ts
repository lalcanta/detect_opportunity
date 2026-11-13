import { defineOpportunity, PHONE_OR_EMAIL } from "../types";

/** Preuve : bilan d'acquisition, suivi d'une démo de site quand la page d'arrivée est en cause. */
export const adsAcquisition = defineOpportunity({
  id: "ads_acquisition",
  status: "draft",
  label: "Publicité et acquisition",
  badge: { text: "Publicité", tone: "purple" },
  icon: "zap",
  requirements: { website: "required", contacts: PHONE_OR_EMAIL },
  channels: ["phone", "email"],
  scanModules: ["trackers_cmp", "ads_pixel_spy", "seo_onpage", "contact_form", "perf_mobile", "freshness_ssl", "contacts_legal", "social_links", "dirigeant_sirene", "branding_visual"],
  proof: { kind: "acquisition_report", generator: "acquisition_report", interestCta: "Je veux en discuter" },
  complementDemo: "auto",
  pitch: { phone: "llm_phone_battlecard", email: "llm_cold_email" },
  flyer: false,
  commercial: {
    businessModel: "recurring",
    pitchFocus: "Acquisition de chantiers par publicité ciblée",
  },
});
