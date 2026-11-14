import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { noProspectOutcome } from "../scanRunner";

describe("scanRunner : lecture Maps sans prospect", () => {
  it("une annulation n'est ni un scan terminé ni un message « aucun prospect »", () => {
    const { message, result } = noProspectOutcome(true, 0);
    assert.equal(message, null);
    assert.deepEqual(result, { processed: 0, total: 0, cancelled: true });
  });

  it("sans annulation, une zone vide reste un scan terminé avec son message", () => {
    const { message, result } = noProspectOutcome(false, 12);
    assert.match(message ?? "", /Aucun prospect qualifié/);
    assert.equal(result.cancelled, false);
  });
});
