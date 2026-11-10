/**
 * Qualification d'un lead après inspection et construction de ses contacts (docs/PLAN_REFONTE_LEADS.md §3.3–3.4).
 */
import {
  describeRejection,
  evaluateRequirements,
  type ChannelId,
  type OpportunityDefinition,
  type QualificationResult,
} from "../../../shared/opportunities";
import type { LeadContact, MapsLead, SiteInspection } from "../types";

/** Un email générique (contact@, info@…) est plus fiable qu'une adresse nominative trouvée au hasard d'une page. */
const GENERIC_EMAIL_RE = /^(contact|hello|bonjour|info|studio|agence|commercial|direction|accueil|devis)@/i;

export function qualifyAfterInspection(
  def: Pick<OpportunityDefinition, "requirements" | "channels">,
  lead: Pick<MapsLead, "phone" | "website">,
  inspection: Pick<SiteInspection, "emails" | "contactForm"> | null,
): QualificationResult {
  return evaluateRequirements(
    def,
    {
      phone: Boolean(lead.phone),
      website: Boolean(lead.website),
      email: Boolean(inspection?.emails?.length),
      contactForm: Boolean(inspection?.contactForm),
    },
    "final",
  );
}

export function buildLeadContacts(
  lead: Pick<MapsLead, "phone">,
  inspection: Pick<SiteInspection, "emails" | "contactForm"> | null,
  primaryChannel: ChannelId | null,
): LeadContact[] {
  const contacts: LeadContact[] = [];
  if (lead.phone) contacts.push({ kind: "phone", value: lead.phone, source: "maps", confidence: 1 });
  for (const email of inspection?.emails ?? []) {
    contacts.push({ kind: "email", value: email, source: "site", confidence: GENERIC_EMAIL_RE.test(email) ? 0.9 : 0.7 });
  }
  const form = inspection?.contactForm;
  if (form) {
    contacts.push({
      kind: "contact_form",
      value: form.url,
      source: "site",
      confidence: form.captcha ? 0.8 : 0.9,
      meta: { fields: form.fields, captcha: form.captcha, hasConsentCheckbox: form.hasConsentCheckbox, provider: form.provider },
    });
  }
  // Le contact principal est le premier du canal principal (pour l'email : le plus fiable, déjà en tête).
  const primary = contacts.find((c) => c.kind === primaryChannel);
  if (primary) primary.is_primary = true;
  return contacts;
}

/** Lead rejeté après inspection : il n'est ni généré ni synchronisé (statut `unqualified` en phase 2). */
export class UnqualifiedLeadError extends Error {
  constructor(readonly result: QualificationResult) {
    super(`prérequis non remplis : ${result.reasons.map(describeRejection).join(" ; ")}`);
    this.name = "UnqualifiedLeadError";
  }
}
