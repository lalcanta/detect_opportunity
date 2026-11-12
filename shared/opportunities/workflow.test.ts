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
