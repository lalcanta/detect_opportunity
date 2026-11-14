import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { preventSleep, withoutSleep, type SleepGuard } from "../worker";

describe("anti-veille pendant un job", () => {
  it("sur macOS, lance caffeinate -i rattaché au worker, puis l'arrête", () => {
    const calls: Array<{ cmd: string; args: string[] }> = [];
    let killed = false;
    const fake = { on: () => fake, kill: () => (killed = true) };
    const g = preventSleep("darwin", (cmd, args) => {
      calls.push({ cmd, args });
      return fake as never;
    });
    assert.equal(calls[0]?.cmd, "caffeinate");
    assert.deepEqual(calls[0]?.args, ["-i", "-w", String(process.pid)]);
    g.stop();
    assert.equal(killed, true);
  });

  it("hors macOS, ne lance rien", () => {
    let started = false;
    preventSleep("linux", () => {
      started = true;
      return {} as never;
    }).stop();
    assert.equal(started, false);
  });

  it("si caffeinate ne peut pas démarrer, le job continue", () => {
    const g = preventSleep("darwin", () => {
      throw new Error("ENOENT");
    });
    assert.doesNotThrow(() => g.stop());
  });

  it("la protection est levée à la fin du job, même en cas d'erreur", async () => {
    let stops = 0;
    const guard = (): SleepGuard => ({ stop: () => void stops++ });
    assert.equal(await withoutSleep(async () => 42, guard), 42);
    await assert.rejects(withoutSleep(async () => { throw new Error("échec"); }, guard), /échec/);
    assert.equal(stops, 2);
  });
});
