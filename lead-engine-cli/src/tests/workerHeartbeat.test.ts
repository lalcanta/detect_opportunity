import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sleep } from "../utils/helpers";
import { withHeartbeat } from "../worker";

describe("withHeartbeat", () => {
  it("bat pendant le job puis s'arrête à la fin", async () => {
    let beats = 0;
    await withHeartbeat(async () => void beats++, () => sleep(55), 10);
    assert.ok(beats >= 2, `battements : ${beats}`);
    const after = beats;
    await sleep(40);
    assert.equal(beats, after);
  });
  it("s'arrête aussi quand le job échoue, et ignore une erreur de battement", async () => {
    let beats = 0;
    await assert.rejects(
      withHeartbeat(async () => { beats++; throw new Error("réseau"); }, async () => { await sleep(30); throw new Error("boom"); }, 10),
      /boom/,
    );
    const after = beats;
    await sleep(40);
    assert.equal(beats, after);
  });
});
