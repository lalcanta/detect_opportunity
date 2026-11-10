import { defineOpportunity } from "../types";

/**
 * Phase 0 : décrit le comportement actuel, incohérent.
 * Le dashboard affiche ce lead en mode email (channels), mais le CLI génère un script d'appel (pitch).
 * Corrigé en phase 1 (docs/PLAN_REFONTE_LEADS.md §2).
 */
export const custom = defineOpportunity({
  id: "custom",
  status: "active",
  label: "Besoin Sur-Mesure",
  badge: { text: "🎯 Sur-Mesure", tone: "zinc" },
  icon: "target",
  channels: ["email"],
  scanModules: ["trackers_cmp", "ads_pixel_spy", "tech_stack", "freshness_ssl", "contacts_legal", "social_links", "dirigeant_sirene", "branding_visual", "perf_mobile"],
  proof: { kind: "demo_web", generator: "llm_demo", focus: "showcase", interestCta: "✅ Ce design me plaît, on en discute" },
  pitch: { kind: "phone_battlecard", generator: "llm_phone_battlecard" },
  flyer: true,
  commercial: {
    businessModel: "both",
    pitchFocus: "Offre personnalisée adaptée au prospect",
  },
});
