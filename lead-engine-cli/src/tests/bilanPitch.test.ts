/** Secours sans modèle d'un bilan : présente le bilan (jamais une maquette de site) et ne cite aucune mesure. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getOpportunityOrDefault } from "../../../shared/opportunities";
import { generateBattlecard } from "../copywriter/battlecard";
import { generateColdEmailPitch } from "../copywriter/coldEmail";
import { STOP_LINE } from "../workflow/pitchPrompt";
import type { ModelRouter } from "../llm/modelRouter";
import type { MapsLead } from "../types";

const lead: MapsLead = {
  name: "Plomberie Martin", activity: "Plombier", city: "Lyon", phone: "04 78 00 00 00", website: "https://m.fr",
  rating: 4.6, reviewsCount: 12, recentReviews: [], mapsUrl: "", placeId: null,
  mapsRank: 4, mapsQuery: "plombier Lyon", mapsCheckedAt: "2026-11-13T09:00:00.000Z",
};
const DEMO = "https://app.test/demos/l1";

function capture(): { router: ModelRouter; prompts: string[] } {
  const prompts: string[] = [];
  const router = { generate: async (r: { prompt: string }) => { prompts.push(r.prompt); throw new Error("hors ligne"); } } as unknown as ModelRouter;
  return { router, prompts };
}
const flat = (card: unknown) => JSON.stringify(card);
/** Aucune mesure du prospect dans un secours : ni note, ni nombre d'avis, ni position. */
const noMeasure = (t: string) => assert.doesNotMatch(t, /4\.6|\b12 avis|★|\bposition\b|\/5/);

describe("secours sans modèle d'un bilan", () => {
  it("battlecard : la consigne reçue part telle quelle, le secours présente le bilan", async () => {
    const { router, prompts } = capture();
    const card = await generateBattlecard(router, "CONSIGNE", lead, DEMO, [], "visibility_report");
    assert.equal(prompts[0], "CONSIGNE");
    const t = flat(card);
    assert.match(t, /bilan de visibilité locale/i);
    assert.ok(t.includes(DEMO));
    assert.doesNotMatch(t, /maquette|futur site|nouveau site|nouvelle version|modernis/i);
    noMeasure(t);
  });
  it("battlecard hors bilan : le secours cite la démo, sans mesure", async () => {
    const card = await generateBattlecard(capture().router, "CONSIGNE", lead, DEMO, []);
    assert.match(flat(card), /démo/);
    noMeasure(flat(card));
  });
  it("message écrit : secours = bilan d'acquisition, sans mesure", async () => {
    const def = getOpportunityOrDefault("ads_acquisition");
    const { router, prompts } = capture();
    const card = await generateColdEmailPitch(router, "CONSIGNE", lead, DEMO, [], def, "email");
    assert.equal(prompts[0], "CONSIGNE");
    const t = flat(card);
    assert.match(t, /bilan d'acquisition/i);
    assert.doesNotMatch(t, /démonstration personnalisée/);
    noMeasure(t);
  });
});

describe("lien principal oublié par le modèle (message écrit)", () => {
  const def = getOpportunityOrDefault("ads_acquisition");
  const reply = (body: string): ModelRouter =>
    ({ generate: async () => ({ text: JSON.stringify({ coldEmail: { subject: "S", body } }) }) }) as unknown as ModelRouter;
  const body = async (b: string): Promise<string> =>
    (await generateColdEmailPitch(reply(b), "CONSIGNE", lead, DEMO, [], def, "email")).coldEmail!.body;

  it("le lien est inséré avant la ligne STOP, qui reste la dernière ligne", async () => {
    const out = await body(`Bonjour,\n\nVoici un constat. Seriez-vous d'accord pour en parler ?\n\n${STOP_LINE}`);
    assert.ok(out.includes(DEMO));
    assert.ok(out.indexOf(DEMO) < out.indexOf(STOP_LINE), out);
    assert.ok(out.trimEnd().endsWith(STOP_LINE), out);
  });
  it("sans ligne STOP : le lien est ajouté à la fin", async () => {
    const out = await body("Bonjour, un constat.");
    assert.ok(out.trimEnd().endsWith(DEMO), out);
  });
  it("lien déjà présent : le message n'est pas modifié", async () => {
    const original = `Bonjour ${DEMO}\n\n${STOP_LINE}`;
    assert.equal(await body(original), original);
  });
});
