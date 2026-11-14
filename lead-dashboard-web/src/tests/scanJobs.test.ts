import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_LOG_LINES, appendLog, failStaleJobs, isStaleJob } from "../services/scanJobs";

const now = new Date("2026-11-14T12:00:00.000Z");
const ago = (min: number) => new Date(now.getTime() - min * 60_000).toISOString();

describe("isStaleJob", () => {
  it("laisse vivant un job dont le battement est récent", () => {
    assert.equal(isStaleJob({ status: "running", heartbeat_at: ago(2), started_at: ago(60) }, now), false);
  });
  it("déclare mort un job muet depuis 11 minutes", () => {
    assert.equal(isStaleJob({ status: "running", heartbeat_at: ago(11), started_at: ago(60) }, now), true);
  });
  it("se rabat sur started_at sans battement", () => {
    assert.equal(isStaleJob({ status: "running", heartbeat_at: null, started_at: ago(30) }, now), true);
    assert.equal(isStaleJob({ status: "running", heartbeat_at: null, started_at: ago(3) }, now), false);
  });
  it("ignore les jobs qui ne tournent pas et lit les dates D1 sans fuseau", () => {
    assert.equal(isStaleJob({ status: "queued", heartbeat_at: null, started_at: ago(60) }, now), false);
    assert.equal(isStaleJob({ status: "running", heartbeat_at: "2026-11-14 11:48:00" }, now), true);
  });
});

describe("appendLog", () => {
  it("ajoute une ligne et ignore une ligne vide", () => {
    assert.equal(appendLog(null, "a"), "a");
    assert.equal(appendLog("a", "b"), "a\nb");
    assert.equal(appendLog("a", null), "a");
  });
  it("ne garde que les 300 dernières lignes", () => {
    let logs: string | null = null;
    for (let i = 1; i <= 350; i++) logs = appendLog(logs, `l${i}`);
    const lines = (logs as string).split("\n");
    assert.equal(lines.length, MAX_LOG_LINES);
    assert.equal(lines[0], "l51");
    assert.equal(lines[299], "l350");
  });
});

describe("failStaleJobs", () => {
  it("exécute un UPDATE borné aux jobs running", async () => {
    const calls: { sql: string; args: unknown[] }[] = [];
    const db = { prepare: (sql: string) => ({ bind: (...args: unknown[]) => ({ run: async () => void calls.push({ sql, args }) }) }) } as unknown as D1Database;
    await failStaleJobs(db, now);
    assert.match(calls[0].sql, /status = 'running'/);
    assert.match(calls[0].sql, /COALESCE\(heartbeat_at, started_at\)/);
    assert.equal(calls[0].args[2], ago(10));
  });
});
