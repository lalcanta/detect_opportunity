import { defineOpportunity, PHONE_ONLY } from "../types";

export const googleReviews = defineOpportunity({
  id: "google_reviews",
  status: "active",
  label: "E-Réputation & Avis Google",
  badge: { text: "⭐ Avis Google", tone: "amber" },
  icon: "star",
  requirements: { website: "optional", contacts: PHONE_ONLY },
  channels: ["phone"],
  scanModules: ["branding_visual", "contacts_legal", "social_links", "dirigeant_sirene", "perf_mobile", "freshness_ssl"],
  proof: { kind: "demo_web", generator: "llm_demo", focus: "reviews", interestCta: "✅ Ce design me plaît, on en discute" },
  pitch: { phone: "llm_phone_battlecard" },
  flyer: false,
  commercial: {
    businessModel: "one_shot",
    pitchFocus: "Boost de note moyenne & collecte d'avis Google",
  },
});
