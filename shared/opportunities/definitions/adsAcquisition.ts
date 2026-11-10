import { defineOpportunity } from "../types";

export const adsAcquisition = defineOpportunity({
  id: "ads_acquisition",
  status: "active",
  label: "Campagnes Ads & Acquisition",
  badge: { text: "⚡ Ads", tone: "purple" },
  icon: "zap",
  channels: ["phone"],
  scanModules: ["trackers_cmp", "ads_pixel_spy", "perf_mobile", "freshness_ssl", "contacts_legal", "social_links", "dirigeant_sirene", "branding_visual"],
  proof: { kind: "demo_web", generator: "llm_demo", focus: "ads_acquisition", interestCta: "✅ Ce design me plaît, on en discute" },
  pitch: { kind: "phone_battlecard", generator: "llm_phone_battlecard" },
  flyer: true,
  commercial: {
    businessModel: "recurring",
    pitchFocus: "Acquisition de chantiers par publicité ciblée",
  },
});
