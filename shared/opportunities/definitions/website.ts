import { defineOpportunity } from "../types";

export const website = defineOpportunity({
  id: "website",
  status: "active",
  label: "Création / Refonte de Site Web",
  badge: { text: "🌐 Site Web", tone: "blue" },
  icon: "globe",
  channels: ["phone"],
  scanModules: ["branding_visual", "perf_mobile", "freshness_ssl", "ads_pixel_spy", "contacts_legal", "social_links", "dirigeant_sirene", "tech_stack"],
  proof: { kind: "demo_web", generator: "llm_demo", focus: "showcase", interestCta: "✅ Ce design me plaît, on en discute" },
  pitch: { kind: "phone_battlecard", generator: "llm_phone_battlecard" },
  flyer: true,
  commercial: {
    businessModel: "one_shot",
    pitchFocus: "Présence web moderne, conversion mobile & Blueprint concurrentiel",
  },
});
