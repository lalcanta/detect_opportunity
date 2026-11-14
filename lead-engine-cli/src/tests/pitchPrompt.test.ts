/** Consigne de texte assemblée depuis les constats des nœuds. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getOpportunityOrDefault, messageToneInstruction, SCAN_MODULE_IDS } from "../../../shared/opportunities";
import { buildPitchPrompt } from "../workflow/pitchPrompt";
import { pitchFacts, proofAngle, type PitchInput } from "../workflow/pitchFacts";
import type { NodeRun } from "../workflow/runner";
import type { MapsLead } from "../types";

const lead: MapsLead = {
  name: "Plomberie Martin", activity: "Plombier", city: "Lyon", phone: "04 78 00 00 00", website: "https://m.fr",
  rating: 5, reviewsCount: 12, recentReviews: [], mapsUrl: "", placeId: null,
  mapsQuery: "plombier Lyon", mapsCheckedAt: "2026-11-13T09:00:00.000Z",
};

function input(over: Partial<PitchInput> = {}): PitchInput {
  return {
    def: getOpportunityOrDefault("website_redesign"), lead, demoUrl: "https://app.test/demos/l1", primaryChannel: "phone",
    inspection: null, sirene: null,
    trace: SCAN_MODULE_IDS.map((m): NodeRun => ({ node: m, wave: 1, status: "done", ms: 0 })),
    report: null, competitorPixels: null, siteDemoUrl: null, ...over,
  };
}

const jsonBlock = (s: string): string => s.slice(s.indexOf("Réponds en JSON strict"));

describe("buildPitchPrompt", () => {
  it("contient les constats, l'offre, l'angle et le ton", () => {
    const p = input({ def: { ...getOpportunityOrDefault("website_redesign"), commercial: { ...getOpportunityOrDefault("website_redesign").commercial, tone: "direct" } } });
    const out = buildPitchPrompt(p, "llm_phone_battlecard");
    assert.ok(out.includes("Constats mesurés (les seuls que tu peux citer)"));
    for (const f of pitchFacts(p)) assert.ok(out.includes(`- ${f.label} : ${f.value}`));
    assert.ok(out.includes(proofAngle(p)));
    assert.ok(out.includes(p.def.label) && out.includes(p.def.commercial.pitchFocus));
    const tone = messageToneInstruction(p.def.commercial.tone);
    assert.ok(tone && out.includes(tone));
  });
  it("schéma selon le générateur", () => {
    const phone = jsonBlock(buildPitchPrompt(input(), "llm_phone_battlecard"));
    for (const k of ["callScript", "objections", "whatsappText", "coldEmail"]) assert.ok(phone.includes(k), k);
    const mail = jsonBlock(buildPitchPrompt(input(), "llm_cold_email"));
    assert.ok(mail.includes("coldEmail") && !mail.includes("callScript"));
  });
  it("formulaire de contact : 900 caractères ; message écrit : ligne STOP", () => {
    const form = buildPitchPrompt(input({ primaryChannel: "contact_form" }), "llm_cold_email");
    assert.ok(form.includes("900 caractères"));
    assert.ok(!buildPitchPrompt(input({ primaryChannel: "email" }), "llm_cold_email").includes("900 caractères"));
    assert.ok(form.includes("Pour ne plus recevoir de message de notre part, répondez simplement STOP."));
  });
  it("ligne STOP : après la question, dans coldEmail.body seulement", () => {
    const mail = buildPitchPrompt(input({ primaryChannel: "email" }), "llm_cold_email");
    assert.ok(mail.includes("Pour ne plus recevoir de message de notre part, répondez simplement STOP."));
    assert.ok(mail.includes("puis la ligne STOP vient en toute dernière ligne, après cette question"));
    const phone = buildPitchPrompt(input(), "llm_phone_battlecard");
    const stop = phone.split("\n").filter((l) => l.includes("STOP"));
    assert.ok(stop.length > 0 && stop.every((l) => l.includes("coldEmail.body") && !/whatsapp/i.test(l)), stop.join("\n"));
  });
  it("note : jamais de valeur par défaut, vraie note quand elle est lue", () => {
    const none = buildPitchPrompt(input({ lead: { ...lead, rating: null, reviewsCount: null } }), "llm_phone_battlecard");
    assert.ok(!/5★|0 avis|n\/a/.test(none));
    assert.ok(buildPitchPrompt(input(), "llm_phone_battlecard").includes("5/5"));
  });
  it("le bloc JSON ne contient ni chiffre ni nom du prospect", () => {
    for (const g of ["llm_phone_battlecard", "llm_cold_email"] as const) {
      const block = jsonBlock(buildPitchPrompt(input(), g));
      assert.ok(!/\d/.test(block), block);
      assert.ok(!block.includes(lead.name));
    }
  });
  it("déterministe", () => {
    assert.equal(buildPitchPrompt(input(), "llm_phone_battlecard"), buildPitchPrompt(input(), "llm_phone_battlecard"));
  });
});
