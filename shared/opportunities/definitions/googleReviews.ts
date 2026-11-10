import { defineOpportunity } from "../types";

export const googleReviews = defineOpportunity({
  id: "google_reviews",
  status: "active",
  label: "E-Réputation & Avis Google",
  badge: { text: "⭐ Avis Google", tone: "amber" },
  icon: "star",
  channels: ["phone"],
  scanModules: ["branding_visual", "contacts_legal", "social_links", "dirigeant_sirene", "perf_mobile", "freshness_ssl"],
  proof: { kind: "demo_web", generator: "llm_demo", focus: "reviews", interestCta: "✅ Ce design me plaît, on en discute" },
  pitch: { kind: "phone_battlecard", generator: "llm_phone_battlecard" },
  flyer: true,
  commercial: {
    businessModel: "one_shot",
    pitchFocus: "Boost de note moyenne & flyers QR avis",
  },
});
