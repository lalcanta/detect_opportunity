import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  describeRejection,
  evaluateRequirements,
  getOpportunityOrDefault,
  needsInspectionToQualify,
  pitchGeneratorFor,
  resolveWebsiteFilter,
} from "./index";

const website = getOpportunityOrDefault("website");
const qa = getOpportunityOrDefault("audit_qa_trackers");
const seo = getOpportunityOrDefault("seo_local");
const ads = getOpportunityOrDefault("ads_acquisition");
const custom = getOpportunityOrDefault("custom");

describe("evaluateRequirements", () => {
  it("website : le téléphone reste éliminatoire dès l'étape Maps", () => {
    const r = evaluateRequirements(website, { phone: false, website: true }, "maps");
    assert.equal(r.qualified, false);
    assert.deepEqual(r.reasons, ["missing_phone"]);
    assert.equal(evaluateRequirements(website, { phone: true, website: false }, "maps").primaryChannel, "phone");
  });

  it("audit QA : une fiche sans téléphone mais avec site est gardée à l'étape Maps", () => {
    const r = evaluateRequirements(qa, { phone: false, website: true }, "maps");
    assert.equal(r.qualified, true);
    assert.equal(r.primaryChannel, null, "canal encore inconnu avant inspection");
  });

  it("audit QA : une fiche sans site est écartée (site exigé, aucun contact écrit possible)", () => {
    const r = evaluateRequirements(qa, { phone: true, website: false }, "maps");
    assert.equal(r.qualified, false);
    assert.ok(r.reasons.includes("website_required"));
    assert.ok(r.reasons.includes("missing_any_of:email|contact_form"));
  });

  it("audit QA : après inspection, un formulaire suffit et devient le canal principal sans email", () => {
    const r = evaluateRequirements(qa, { phone: false, website: true, email: false, contactForm: true }, "final");
    assert.equal(r.qualified, true);
    assert.equal(r.primaryChannel, "contact_form");
    const withEmail = evaluateRequirements(qa, { phone: true, website: true, email: true, contactForm: true }, "final");
    assert.equal(withEmail.primaryChannel, "email");
    assert.deepEqual(withEmail.availableChannels, ["email", "contact_form"]);
  });

  it("audit QA : après inspection, sans email ni formulaire, le lead est rejeté", () => {
    const r = evaluateRequirements(qa, { phone: true, website: true, email: false, contactForm: false }, "final");
    assert.equal(r.qualified, false);
    assert.deepEqual(r.reasons, ["missing_any_of:email|contact_form"]);
  });

  it("SEO local : l'email suffit quand il n'y a pas de téléphone", () => {
    assert.equal(evaluateRequirements(seo, { phone: false, website: false }, "maps").qualified, false);
    const r = evaluateRequirements(seo, { phone: false, website: true, email: true }, "final");
    assert.equal(r.qualified, true);
    assert.equal(r.primaryChannel, "email");
  });

  it("Ads : le site est exigé", () => {
    assert.deepEqual(evaluateRequirements(ads, { phone: true, website: false }, "maps").reasons, ["website_required"]);
  });

  it("Sur-mesure : l'email passe avant le téléphone", () => {
    const r = evaluateRequirements(custom, { phone: true, website: true, email: true }, "final");
    assert.equal(r.primaryChannel, "email");
  });
});

describe("needsInspectionToQualify", () => {
  it("vaut false quand seul le téléphone est exigé", () => {
    assert.equal(needsInspectionToQualify(website), false);
    assert.equal(needsInspectionToQualify(qa), true);
    assert.equal(needsInspectionToQualify(seo), true);
  });
});

describe("resolveWebsiteFilter", () => {
  it("déduit le filtre de l'opportunité et refuse un filtre contradictoire", () => {
    assert.deepEqual(resolveWebsiteFilter(qa, "all"), { filter: "has_website" });
    assert.deepEqual(resolveWebsiteFilter(qa, null), { filter: "has_website" });
    assert.equal(resolveWebsiteFilter(qa, "no_website").filter, "has_website");
    assert.ok(resolveWebsiteFilter(qa, "no_website").error);
    assert.deepEqual(resolveWebsiteFilter(website, "no_website"), { filter: "no_website" });
    assert.deepEqual(resolveWebsiteFilter(website, "n'importe quoi"), { filter: "all" });
  });
});

describe("pitchGeneratorFor", () => {
  it("prend le générateur du canal principal, sinon celui du premier canal", () => {
    assert.equal(pitchGeneratorFor(seo, "email"), "llm_cold_email");
    assert.equal(pitchGeneratorFor(seo, "phone"), "llm_phone_battlecard");
    assert.equal(pitchGeneratorFor(seo, null), "llm_phone_battlecard");
    assert.equal(pitchGeneratorFor(qa, "contact_form"), "tracker_cold_email");
    assert.equal(pitchGeneratorFor(website, "contact_form"), "llm_phone_battlecard", "canal hors opportunité ignoré");
  });
});

describe("describeRejection", () => {
  it("rend les raisons lisibles", () => {
    assert.equal(describeRejection("missing_phone"), "pas de téléphone");
    assert.equal(describeRejection("missing_any_of:email|contact_form"), "aucun contact parmi : email, formulaire de contact");
  });
});
