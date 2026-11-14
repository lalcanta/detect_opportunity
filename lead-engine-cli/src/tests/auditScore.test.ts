import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existingAuditScore } from "../utils/auditScore";

describe("existingAuditScore", () => {
  it("garde un score numérique, y compris 0", () => {
    assert.equal(existingAuditScore(72), 72);
    assert.equal(existingAuditScore(0), 0);
  });
  it("sans score numérique : null, pas de repli à 50", () => {
    for (const v of [undefined, null, "50", NaN, {}]) assert.equal(existingAuditScore(v), null);
  });
});
