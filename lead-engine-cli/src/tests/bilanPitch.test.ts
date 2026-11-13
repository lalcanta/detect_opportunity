/** Message et dossier du closer d'un bilan : le lien /demos/:id est le bilan, pas une maquette de site. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getOpportunityOrDefault } from "../../../shared/opportunities";
import { generateBattlecard } from "../copywriter/battlecard";
import { generateColdEmailPitch } from "../copywriter/coldEmail";
import type { ModelRouter } from "../llm/modelRouter";
import type { MapsLead, SiteAudit } from "../types";

const lead: MapsLead = {
  name: "Plomberie Martin", activity: "Plombier", city: "Lyon", phone: "04 78 00 00 00", website: "https://m.fr",
  rating: 4.6, reviewsCount: 12, recentReviews: [], mapsUrl: "", placeId: null,
  mapsRank: 4, mapsQuery: "plombier Lyon", mapsCheckedAt: "2026-11-13T09:00:00.000Z",
  competitors: [{ name: "Plomberie Durand", rank: 1, rating: 4.8, reviewsCount: 90, website: null, category: "Plombier" }],
};
const audit: SiteAudit = { summary: "Bilan de visibilité locale : 52/100 sur les critères mesurés.", weaknesses: ["Collecter davantage d'avis Google auprès des clients"], score: 52 };
const DEMO = "https://app.test/demos/l1";

function capture(): { router: ModelRouter; prompts: string[] } {
  const prompts: string[] = [];
  const router = { generate: async (r: { prompt: string }) => { prompts.push(r.prompt); throw new Error("hors ligne"); } } as unknown as ModelRouter;
  return { router, prompts };
}
const flat = (card: unknown) => JSON.stringify(card);

describe("battlecard d'un bilan", () => {
  it("prompt : lien = bilan, avec recherche, date, rang, concurrents, score et actions", async () => {
    const { router, prompts } = capture();
    await generateBattlecard(router, lead, audit, DEMO, [], "", { kind: "visibility_report", siteDemoUrl: null });
    const p = prompts[0]!;
    assert.match(p, /bilan de visibilité locale/i);
    assert.match(p, /pas une maquette de site/);
    assert.match(p, /« plombier Lyon »/);
    assert.match(p, /13 novembre 2026/);
    assert.match(p, /position 4/);
    assert.match(p, /Plomberie Durand/);
    assert.match(p, /52\/100/);
    assert.match(p, /Collecter davantage d'avis/);
    assert.doesNotMatch(p, /maquette préparée|démo déjà créée|démo gratuite/);
    assert.match(p, /Aucune démo de site/);
  });
  it("prompt : démo de site citée comme complément éventuel quand elle est produite", async () => {
    const { router, prompts } = capture();
    await generateBattlecard(router, lead, audit, DEMO, [], "", { kind: "acquisition_report", siteDemoUrl: `${DEMO}/site` });
    assert.match(prompts[0]!, /bilan d'acquisition/i);
    assert.match(prompts[0]!, /complément éventuel.*\/demos\/l1\/site|\/demos\/l1\/site.*complément éventuel/);
  });
  it("secours sans modèle : présente le bilan, jamais une maquette ni un nouveau site", async () => {
    const card = await generateBattlecard(capture().router, lead, audit, DEMO, [], "", { kind: "visibility_report", siteDemoUrl: null });
    const t = flat(card);
    assert.match(t, /bilan/i);
    assert.ok(t.includes(DEMO));
    assert.doesNotMatch(t, /maquette|futur site|nouveau site|nouvelle version|modernis/i);
  });
  it("hors bilan : la démo de site reste présentée comme telle", async () => {
    const { router, prompts } = capture();
    await generateBattlecard(router, lead, audit, DEMO, [], "");
    assert.match(prompts[0]!, /démo déjà créée/);
  });
});

describe("message écrit d'un bilan", () => {
  const def = getOpportunityOrDefault("ads_acquisition");
  it("prompt et secours : lien = bilan d'acquisition", async () => {
    const { router, prompts } = capture();
    const card = await generateColdEmailPitch(router, lead, audit, DEMO, [], def, "email", { kind: "acquisition_report", siteDemoUrl: null });
    assert.match(prompts[0]!, /bilan d'acquisition/i);
    assert.match(prompts[0]!, /pas une maquette de site/);
    assert.match(prompts[0]!, /« plombier Lyon »/);
    assert.doesNotMatch(prompts[0]!, /Lien de la démo déjà préparée/);
    const t = flat(card);
    assert.match(t, /bilan/i);
    assert.doesNotMatch(t, /démonstration personnalisée/);
  });
});
