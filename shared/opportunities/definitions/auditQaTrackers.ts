import { defineOpportunity, EMAIL_OR_FORM } from "../types";

export const auditQaTrackers = defineOpportunity({
  id: "audit_qa_trackers",
  status: "active",
  label: "Audit traceurs RGPD",
  badge: { text: "Audit traceurs", tone: "cyan" },
  icon: "shield",
  requirements: { website: "required", contacts: EMAIL_OR_FORM },
  channels: ["email", "contact_form"],
  scanModules: ["trackers_cmp", "ads_pixel_spy", "tech_stack", "contacts_legal", "contact_form", "social_links", "dirigeant_sirene", "branding_visual", "freshness_ssl"],
  proof: { kind: "audit_report", generator: "tracker_report", interestCta: "Ce rapport m'intéresse (CI/CD)" },
  pitch: { email: "tracker_cold_email", contact_form: "tracker_cold_email" },
  flyer: false,
  commercial: {
    businessModel: "recurring",
    pitchFocus: "Détection fuites CMP / tags marketing avant consentement & filet CI/CD",
  },
});
