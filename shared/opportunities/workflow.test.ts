/** Graphe de nœuds d'un besoin : nœuds déduits de la définition, clés disponibles et dépendances. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CODE_OPPORTUNITIES,
  DATA_KEYS,
  WORKFLOW_NODES,
  WORKFLOW_STAGES,
  availableKeys,
  checkWorkflow,
  evaluateRequirements,
  workflowNodeIds,
  workflowWaves,
  type OpportunityDefinition,
} from "./index";

const byId = (id: string): OpportunityDefinition => JSON.parse(JSON.stringify(CODE_OPPORTUNITIES.find((o) => o.id === id)!));

describe("catalogue des nœuds", () => {
  it("chaque nœud a un identifiant unique, une étape connue et des clés déclarées", () => {
    const ids = new Set<string>();
    const stages = new Set<string>(WORKFLOW_STAGES.map((s) => s.id));
    for (const n of WORKFLOW_NODES) {
      assert.ok(!ids.has(n.id), `${n.id} en double`);
      ids.add(n.id);
      assert.ok(stages.has(n.stage), `${n.id} : étape ${n.stage}`);
      for (const k of [...n.reads, ...(n.optionalReads ?? []), ...n.writes]) assert.ok(k in DATA_KEYS, `${n.id} : clé ${k}`);
    }
  });

  it("chaque clé lue est écrite par au moins un nœud", () => {
    const written = new Set(WORKFLOW_NODES.flatMap((n) => n.writes));
    for (const n of WORKFLOW_NODES) for (const k of n.reads) assert.ok(written.has(k), `${n.id} lit ${k}, que personne n'écrit`);
  });
});

describe("workflow d'un besoin", () => {
  it("les besoins du code sont cohérents", () => {
    for (const def of CODE_OPPORTUNITIES) assert.deepEqual(checkWorkflow(def), [], def.id);
  });

  it("déduit les nœuds dans l'ordre, canaux dans l'ordre de préférence", () => {
    assert.deepEqual(workflowNodeIds(byId("website_creation")), [
      "maps_search",
      "maps_filter",
      "dirigeant_sirene",
      "qualify",
      "demo_web",
      "llm_phone_battlecard",
      "crm_handoff",
      "channel_phone",
    ]);
    const audit = workflowNodeIds(byId("audit_qa_trackers"));
    assert.deepEqual(audit.slice(-2), ["channel_email", "channel_contact_form"]);
    assert.equal(audit.filter((id) => id === "tracker_cold_email").length, 1);
  });

  it("les bilans sont suivis de la démo de site complémentaire", () => {
    const seo = workflowNodeIds(byId("seo_local"));
    assert.ok(seo.includes("seo_onpage"));
    assert.ok(seo.indexOf("visibility_report") >= 0 && seo.indexOf("site_demo") === seo.indexOf("visibility_report") + 1);
    const ads = workflowNodeIds(byId("ads_acquisition"));
    assert.ok(ads.indexOf("acquisition_report") >= 0 && ads.indexOf("site_demo") === ads.indexOf("acquisition_report") + 1);
    assert.ok(!workflowNodeIds(byId("website")).includes("site_demo"));
    assert.deepEqual(checkWorkflow(byId("seo_local")), []);
    assert.deepEqual(checkWorkflow(byId("ads_acquisition")), []);
    const waves = workflowWaves(seo, "optional");
    const idx = (id: string) => waves.findIndex((w) => w.includes(id));
    assert.ok(idx("visibility_report") < idx("site_demo"));
    assert.ok(DATA_KEYS.demo_site.label);
  });

  it("sans site, le filtre ne transmet ni site ni site garanti", () => {
    const keys = availableKeys(["maps_search", "maps_filter"], "forbidden");
    assert.ok(keys.has("telephone") && !keys.has("site") && !keys.has("site_garanti"));
    assert.ok(!availableKeys(["maps_search", "maps_filter"], "optional").has("site_garanti"));
  });
});

describe("critères de la fiche Maps", () => {
  const def = { ...byId("google_reviews") };
  def.requirements = { ...def.requirements, listing: { minRating: 4, maxReviews: 20 } };

  it("écarte une note trop basse ou trop d'avis", () => {
    const low = evaluateRequirements(def, { phone: true, website: false, rating: 3.6, reviewsCount: 5 }, "maps");
    assert.deepEqual(low.reasons, ["rating_below:4"]);
    const many = evaluateRequirements(def, { phone: true, website: false, rating: 4.8, reviewsCount: 120 }, "maps");
    assert.deepEqual(many.reasons, ["reviews_above:20"]);
  });

  it("n'écarte pas une fiche dont la note est inconnue", () => {
    assert.ok(evaluateRequirements(def, { phone: true, website: false, rating: null, reviewsCount: null }, "maps").qualified);
  });
});

describe("ordre d'exécution", () => {
  it("chaque nœud passe après ceux qui écrivent ce qu'il lit", () => {
    for (const def of CODE_OPPORTUNITIES) {
      const waves = workflowWaves(workflowNodeIds(def), def.requirements.website);
      const waveOf = new Map<string, number>();
      waves.forEach((w, i) => w.forEach((id) => waveOf.set(id, i)));
      assert.equal(waveOf.size, workflowNodeIds(def).length, def.id);
      for (const id of waveOf.keys()) {
        const node = WORKFLOW_NODES.find((n) => n.id === id)!;
        for (const k of [...node.reads, ...(node.optionalReads ?? [])]) {
          for (const w of waveOf.keys()) {
            const writer = WORKFLOW_NODES.find((n) => n.id === w)!;
            if (w !== id && writer.writes.includes(k) && availableKeys([w], def.requirements.website).has(k)) {
              assert.ok(waveOf.get(w)! < waveOf.get(id)!, `${def.id} : ${w} avant ${id}`);
            }
          }
        }
      }
    }
  });

  it("l'inspection du site et la recherche SIRENE tournent dans la même vague, puis la preuve et le flyer ensemble", () => {
    const def = { ...byId("google_reviews"), flyer: true };
    const waves = workflowWaves(workflowNodeIds(def), def.requirements.website);
    const together = (a: string, b: string) => waves.some((w) => w.includes(a) && w.includes(b));
    assert.ok(together("branding_visual", "dirigeant_sirene"));
    assert.ok(together("demo_web", "flyer"));
    assert.deepEqual(waves[0], ["maps_search"]);
    assert.deepEqual(waves.at(-1), ["channel_phone"]);
  });

  it("un besoin sans site lance SIRENE dès le filtre Maps passé", () => {
    const def = byId("website_creation");
    const waves = workflowWaves(workflowNodeIds(def), def.requirements.website);
    const idx = (id: string) => waves.findIndex((w) => w.includes(id));
    assert.ok(idx("dirigeant_sirene") > idx("maps_filter"));
    assert.equal(idx("dirigeant_sirene"), idx("maps_filter") + 1);
  });
});
