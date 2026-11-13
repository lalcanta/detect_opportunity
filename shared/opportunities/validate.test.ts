/** Validation des besoins édités dans le dashboard et chargement dans le registre partagé. */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  ACTIVE_OPPORTUNITIES,
  ALL_OPPORTUNITY_IDS,
  CODE_OPPORTUNITIES,
  OPPORTUNITIES,
  findOpportunity,
  getOpportunityOrDefault,
  onOpportunitiesChange,
  resetOpportunityDefinitions,
  setOpportunityDefinitions,
  validateOpportunityDefinition,
  type OpportunityDefinition,
} from "./index";

const clone = (d: OpportunityDefinition): any => JSON.parse(JSON.stringify(d));
const website = () => clone(CODE_OPPORTUNITIES.find((o) => o.id === "website")!);
const audit = () => clone(CODE_OPPORTUNITIES.find((o) => o.id === "audit_qa_trackers")!);

function errorsOf(raw: unknown): string[] {
  const r = validateOpportunityDefinition(raw);
  return r.ok ? [] : r.errors;
}

describe("validateOpportunityDefinition", () => {
  it("accepte toutes les définitions du code, à l'identique", () => {
    for (const def of CODE_OPPORTUNITIES) {
      const r = validateOpportunityDefinition(clone(def));
      assert.ok(r.ok, `${def.id} : ${r.ok ? "" : r.errors.join(" ; ")}`);
      assert.deepEqual(r.def, clone(def));
    }
  });

  it("refuse un identifiant mal formé", () => {
    assert.ok(errorsOf({ ...website(), id: "Site Web" }).some((e) => e.startsWith("identifiant")));
  });

  it("refuse un canal sans message et un message sans canal", () => {
    const noPitch = website();
    delete noPitch.pitch.email;
    assert.ok(errorsOf(noPitch).some((e) => e.includes("aucun message pour le canal email")));
    const extra = website();
    extra.pitch.contact_form = "llm_cold_email";
    assert.ok(errorsOf(extra).some((e) => e.includes("n'est pas un canal du besoin")));
  });

  it("refuse un script d'appel pour l'email", () => {
    const d = website();
    d.pitch.email = "llm_phone_battlecard";
    assert.ok(errorsOf(d).some((e) => e.startsWith("« Email » a besoin de « Message écrit »")));
  });

  it("refuse un contact exigé qui n'est pas un canal", () => {
    const d = website();
    d.requirements.contacts = { allOf: ["contact_form"] };
    assert.ok(errorsOf(d).some((e) => e.includes("doit faire partie des canaux")));
  });

  it("refuse un email exigé ou utilisé quand le site est interdit", () => {
    const d = website();
    d.requirements = { website: "forbidden", contacts: { allOf: ["email"] } };
    assert.ok(errorsOf(d).some((e) => e.includes("« Site web » : impossible pour un besoin « sans site »")));
    const c = website();
    c.requirements = { website: "forbidden", contacts: { allOf: ["phone"] } };
    c.scanModules = ["dirigeant_sirene"];
    assert.ok(errorsOf(c).some((e) => e.startsWith("« Email » a besoin de « Email »")));
    c.channels = ["phone"];
    c.pitch = { phone: "llm_phone_battlecard" };
    assert.deepEqual(errorsOf(c), []);
  });

  it("exige la vérification qui trouve l'email", () => {
    const d = website();
    d.scanModules = d.scanModules.filter((m: string) => m !== "contacts_legal");
    assert.ok(errorsOf(d).some((e) => e === "« Email » a besoin de « Email » : ajoutez « Email et mentions »"));
  });

  it("réserve le rapport d'audit et son email aux prospects avec site", () => {
    const d = audit();
    d.requirements.website = "optional";
    assert.ok(errorsOf(d).some((e) => e.includes("réglez le filtre Maps sur « Site exigé »")));
    const w = website();
    w.pitch.email = "tracker_cold_email";
    assert.ok(errorsOf(w).some((e) => e.startsWith("« Email d'audit » a besoin de « Rapport d'audit »")));
  });

  it("refuse deux messages différents pour l'email et le formulaire", () => {
    const d = audit();
    d.proof = { kind: "audit_report", generator: "tracker_report", interestCta: "ok" };
    d.pitch.contact_form = "llm_cold_email";
    assert.ok(errorsOf(d).some((e) => e.includes("produisent tous deux « Message écrit »")));
  });

  it("valide les critères de la fiche Maps, les points forts et le ton", () => {
    const d = website();
    d.requirements.listing = { minRating: 4, maxReviews: 30 };
    d.proof.highlights = ["gallery", "faq"];
    d.commercial.tone = "direct";
    const r = validateOpportunityDefinition(d);
    assert.ok(r.ok);
    if (r.ok) {
      assert.deepEqual(r.def.requirements.listing, { minRating: 4, maxReviews: 30 });
      assert.deepEqual(r.def.proof.kind === "demo_web" && r.def.proof.highlights, ["gallery", "faq"]);
      assert.equal(r.def.commercial.tone, "direct");
    }
    assert.ok(errorsOf({ ...d, requirements: { ...d.requirements, listing: { minRating: 7 } } }).some((e) => e.startsWith("note minimale")));
    assert.ok(errorsOf({ ...d, requirements: { ...d.requirements, listing: { minRating: 4.5, maxRating: 4 } } }).some((e) => e.includes("minimum dépasse")));
    assert.ok(errorsOf({ ...d, proof: { ...d.proof, highlights: ["licorne"] } }).some((e) => e.includes("valeur inconnue")));
  });

  it("reprend le libellé quand l'angle commercial est vide", () => {
    const d = website();
    d.commercial.pitchFocus = "  ";
    const r = validateOpportunityDefinition(d);
    assert.ok(r.ok && r.def.commercial.pitchFocus === d.label);
  });

  it("valide les bilans et leur démo complémentaire", () => {
    const seo = clone(CODE_OPPORTUNITIES.find((o) => o.id === "seo_local")!);
    assert.equal(seo.proof.kind, "visibility_report");
    assert.equal(seo.complementDemo, "auto");
    assert.ok(errorsOf({ ...seo, proof: { ...seo.proof, generator: "llm_demo" } }).some((e) => e.includes("visibility_report")));
    const ads = clone(CODE_OPPORTUNITIES.find((o) => o.id === "ads_acquisition")!);
    assert.ok(errorsOf({ ...ads, proof: { ...ads.proof, generator: "tracker_report" } }).some((e) => e.includes("acquisition_report")));
    assert.ok(errorsOf({ ...seo, complementDemo: "parfois" }).some((e) => e.startsWith("démo complémentaire")));
    const never = validateOpportunityDefinition({ ...seo, complementDemo: "never" });
    assert.ok(never.ok && never.def.complementDemo === "never");
    const none = { ...seo };
    delete none.complementDemo;
    const r = validateOpportunityDefinition(none);
    assert.ok(r.ok && r.def.complementDemo === undefined);
  });

  it("refuse un module, un statut ou une preuve inconnus", () => {
    assert.ok(errorsOf({ ...website(), scanModules: ["inconnu"] }).some((e) => e.includes("valeur inconnue")));
    assert.ok(errorsOf({ ...website(), status: "en_pause" }).length > 0);
    assert.ok(errorsOf({ ...website(), proof: { kind: "pdf" } }).some((e) => e.includes("type de preuve inconnu")));
  });
});

describe("setOpportunityDefinitions", () => {
  afterEach(() => resetOpportunityDefinitions());

  it("remplace les définitions sur place et prévient les abonnés", () => {
    const ref = OPPORTUNITIES;
    let calls = 0;
    onOpportunitiesChange(() => calls++);
    const custom = { ...website(), id: "refonte_site", status: "active", label: "Refonte de site", requirements: { website: "required", contacts: { allOf: ["phone"] } } };
    const draft = { ...audit(), status: "draft" };
    const res = setOpportunityDefinitions([custom, draft]);
    assert.equal(res.loaded, 2);
    assert.equal(OPPORTUNITIES, ref);
    assert.deepEqual(ALL_OPPORTUNITY_IDS, ["refonte_site", "audit_qa_trackers"]);
    assert.deepEqual(ACTIVE_OPPORTUNITIES.map((o) => o.id), ["refonte_site"]);
    assert.equal(findOpportunity("refonte_site")?.label, "Refonte de site");
    assert.ok(calls >= 1);
  });

  it("ignore les définitions invalides ou en double et les signale", () => {
    const res = setOpportunityDefinitions([website(), { ...website() }, { id: "cassé" }]);
    assert.equal(res.loaded, 1);
    assert.deepEqual(Object.keys(res.errors).sort(), ["cassé", "website"]);
  });

  it("garde les définitions du code si rien n'est valide", () => {
    setOpportunityDefinitions([{ id: "x" }]);
    assert.equal(OPPORTUNITIES.length, CODE_OPPORTUNITIES.length);
  });

  it("retombe sur la définition du code quand le besoin par défaut a disparu", () => {
    setOpportunityDefinitions([audit()]);
    assert.equal(getOpportunityOrDefault("inconnu").id, "website_redesign");
  });
});
