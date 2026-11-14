/** Exécuteur du workflow : vagues par lead, SIRENE sans site, qualification et nœuds passés. */
import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { BrowserContext } from "playwright";
import { getOpportunityOrDefault } from "../../../shared/opportunities";
import { UnqualifiedLeadError } from "../opportunities/qualify";
import type { ModelRouter } from "../llm/modelRouter";
import { buildPitchPrompt } from "../workflow/pitchPrompt";
import { leadWorkflowWaves, pitchInputFromDossier, runLeadWorkflow } from "../workflow/runner";
import type { MapsLead } from "../types";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Réponse SIRENE simulée, avec un délai pour vérifier le parallélisme. */
function stubSirene(delayMs = 0): { calls: number } {
  const state = { calls: 0 };
  globalThis.fetch = (async () => {
    state.calls++;
    await new Promise((r) => setTimeout(r, delayMs));
    return new Response(
      JSON.stringify({ results: [{ siren: "123456789", date_creation: "2015-03-01", dirigeants: [{ prenoms: "JEAN PAUL", nom: "MARTIN" }] }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
  return state;
}

const lead = (over: Partial<MapsLead> = {}): MapsLead => ({
  name: "Plomberie Martin",
  activity: "Plombier",
  city: "Lyon",
  phone: "04 78 00 00 00",
  website: null,
  rating: 4.6,
  reviewsCount: 12,
  recentReviews: [],
  mapsUrl: "https://maps.google.com/?cid=1",
  placeId: null,
  ...over,
});

const env = { mode: "prep" as const, context: {} as BrowserContext, remoteAppUrl: "https://crm.test" };
const input = (l: MapsLead) => ({ def: getOpportunityOrDefault("website_creation"), lead: l, leadId: "pm", demoUrl: "https://crm.test/demos/pm" });

describe("exécuteur du workflow", () => {
  it("les vagues d'un lead commencent après le filtre Maps et s'arrêtent avant la remise au CRM", () => {
    const waves = leadWorkflowWaves(getOpportunityOrDefault("google_reviews"));
    const all = waves.flat();
    assert.ok(!all.includes("maps_search") && !all.includes("maps_filter") && !all.includes("crm_handoff"));
    assert.ok(!all.some((id) => id.startsWith("channel_")));
    assert.ok(waves[0]!.includes("dirigeant_sirene") && waves[0]!.includes("branding_visual"));
  });

  it("un prospect sans site obtient son dirigeant via SIRENE", async () => {
    const sirene = stubSirene();
    const d = await runLeadWorkflow(input(lead()), env);
    assert.equal(sirene.calls, 1);
    assert.equal(d.sirene?.siren, "123456789");
    assert.deepEqual(d.sirene?.keyPeople, ["Jean Martin"]);
    assert.equal(d.primaryChannel, "phone");
    const sireneRun = d.trace.find((t) => t.node === "dirigeant_sirene")!;
    const qualifyRun = d.trace.find((t) => t.node === "qualify")!;
    assert.equal(sireneRun.status, "done");
    // Indépendants : la qualification n'attend pas SIRENE.
    assert.equal(sireneRun.wave, qualifyRun.wave);
    // En mode prep, la preuve et le message sont laissés à la file locale.
    assert.equal(d.trace.find((t) => t.node === "demo_web")?.status, "skipped");
    assert.equal(d.demoHtml, null);
  });

  it("un lead écarté garde ce qui a été mesuré, SIREN compris", async () => {
    stubSirene(20);
    await assert.rejects(runLeadWorkflow(input(lead({ phone: null })), env), (err: unknown) => {
      assert.ok(err instanceof UnqualifiedLeadError);
      assert.equal(err.payload?.status, "unqualified");
      assert.equal(err.payload?.audit_data.siren, "123456789");
      return true;
    });
  });

  it("les modules du site sont passés quand le prospect n'a pas de site", async () => {
    stubSirene();
    const d = await runLeadWorkflow({ ...input(lead()), def: getOpportunityOrDefault("google_reviews") }, env);
    const branding = d.trace.find((t) => t.node === "branding_visual")!;
    assert.equal(branding.status, "skipped");
    assert.match(branding.note ?? "", /Site web/);
    assert.equal(d.trace.find((t) => t.node === "dirigeant_sirene")?.status, "done");
  });

  it("mode complet : le modèle reçoit la consigne assemblée, sans mesure absente", async () => {
    stubSirene();
    const prompts: string[] = [];
    const router = {
      generate: async (r: { prompt: string }) => {
        prompts.push(r.prompt);
        return { text: "{}" };
      },
    } as unknown as ModelRouter;
    const def = { ...getOpportunityOrDefault("seo_local"), complementDemo: "never" as const };
    const l = lead({ rating: null, reviewsCount: null, mapsRank: 1, mapsQuery: "plombier Lyon", mapsCheckedAt: "2026-11-13T09:00:00.000Z" });
    const d = await runLeadWorkflow({ def, lead: l, leadId: "pm", demoUrl: "https://crm.test/demos/pm" }, { ...env, mode: "full", router });
    assert.equal(prompts.length, 1);
    assert.equal(prompts[0], buildPitchPrompt(pitchInputFromDossier(d, env.remoteAppUrl), "llm_phone_battlecard"));
    assert.doesNotMatch(prompts[0]!, /manque de visibilité|5★/);
    assert.equal(pitchInputFromDossier(d, env.remoteAppUrl).siteDemoUrl, null);
  });
});
