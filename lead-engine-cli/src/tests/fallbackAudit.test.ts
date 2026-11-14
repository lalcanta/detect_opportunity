import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildFallbackAudit } from "../inspector/siteAuditor";
import { buildTrackerAudit } from "../opportunities/generators";
import type { SiteInspection } from "../types";

const inspection = (over: Partial<SiteInspection>): SiteInspection => ({ loadTimeMs: 1200, isResponsive: true, dominantColors: [], ...over }) as SiteInspection;

describe("audit de repli : aucune valeur inventée", () => {
  it("sans inspection : pas de score, pas de faiblesse", () => {
    const a = buildFallbackAudit(null);
    assert.equal(a.score, null);
    assert.deepEqual(a.weaknesses, []);
  });
  it("site correct mesuré : pas de faiblesse ni de score", () => {
    const a = buildFallbackAudit(inspection({}));
    assert.equal(a.score, null);
    assert.deepEqual(a.weaknesses, []);
  });
  it("faiblesses tirées des seules mesures", () => {
    const a = buildFallbackAudit(inspection({ isResponsive: false, loadTimeMs: 5200 }));
    assert.equal(a.score, null);
    assert.equal(a.weaknesses.length, 2);
    assert.match(a.weaknesses.join(" "), /smartphone/);
    assert.match(a.weaknesses.join(" "), /5200 ms/);
    assert.doesNotMatch(a.weaknesses.join(" "), /appel direct|vieillissant/);
  });
  it("erreur d'inspection : la cause est citée", () => {
    const a = buildFallbackAudit(inspection({ error: "timeout" }));
    assert.match(a.weaknesses[0]!, /timeout/);
    assert.equal(a.score, null);
  });
});

describe("audit des traceurs sans traceur", () => {
  it("pas de score 70 inventé ni de conseil présenté comme constat", () => {
    const a = buildTrackerAudit(inspection({ trackersFound: [] }));
    assert.equal(a.score, null);
    assert.deepEqual(a.weaknesses, []);
  });
  it("avec traceurs : score et constats mesurés", () => {
    const a = buildTrackerAudit(inspection({ trackersFound: ["GA4"] }));
    assert.equal(typeof a.score, "number");
    assert.equal(a.weaknesses.length, 1);
  });
});
