import { defineOpportunity } from "../types";

export const auditQaTrackers = defineOpportunity({
  id: "audit_qa_trackers",
  status: "active",
  label: "Audit QA Régression & Traceurs RGPD",
  badge: { text: "🛡️ Audit QA Traceurs", tone: "cyan" },
  icon: "shield",
  channels: ["email"],
  scanModules: ["trackers_cmp", "ads_pixel_spy", "tech_stack", "contacts_legal", "social_links", "dirigeant_sirene", "branding_visual", "freshness_ssl"],
  proof: { kind: "audit_report", generator: "tracker_report", interestCta: "✅ Ce rapport m'intéresse (CI/CD)" },
  pitch: { kind: "cold_email", generator: "tracker_cold_email" },
  flyer: false,
  commercial: {
    businessModel: "recurring",
    pitchFocus: "Détection fuites CMP / tags marketing avant consentement & filet CI/CD",
  },
});
