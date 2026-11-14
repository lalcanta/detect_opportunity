import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { after, before } from "node:test";
import { Miniflare } from "miniflare";
import { Hono } from "hono";
import type { AppEnv } from "../types";
import { scanRoutes } from "../routes/scans";
import { MAX_LOG_LINES, failStaleJobs, isStaleJob } from "../services/scanJobs";

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

describe("route de progression du worker (D1 réelle via miniflare)", () => {
  let mf: Miniflare;
  let db: D1Database;
  let app: Hono<AppEnv>;
  const TOKEN = "secret-test";

  before(async () => {
    mf = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('') } }", d1Databases: { DB: "scan-jobs-test" } });
    db = (await mf.getD1Database("DB")) as unknown as D1Database;
    const ddl = /CREATE TABLE IF NOT EXISTS scan_jobs \([\s\S]*?\n\);/.exec(readFileSync(new URL("../../schema.sql", import.meta.url), "utf8"))![0];
    await db.prepare(ddl.replace(/--[^\n]*/g, "").replace(/\s+/g, " ")).run();
    app = new Hono<AppEnv>();
    app.route("/", scanRoutes);
  });
  after(async () => {
    await mf.dispose();
  });

  const insert = async (status: string, logs: string | null = null, heartbeat: string | null = null) => {
    const r = await db
      .prepare("INSERT INTO scan_jobs (query, city, status, started_at, heartbeat_at, logs) VALUES ('q','c',?1,?2,?3,?4)")
      .bind(status, ago(1), heartbeat, logs)
      .run();
    return r.meta.last_row_id as number;
  };
  const progress = async (id: number, body: Record<string, unknown>) => {
    const res = await app.request(`/api/worker/jobs/${id}/progress`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }, { DB: db, SYNC_SECRET_TOKEN: TOKEN });
    return (await res.json()) as { cancel?: boolean };
  };
  const row = (id: number) => db.prepare("SELECT status, logs, heartbeat_at, processed FROM scan_jobs WHERE id = ?").bind(id).first<{ status: string; logs: string | null; heartbeat_at: string | null; processed: number }>();

  it("un battement met heartbeat_at à jour sans toucher au statut ni aux logs", async () => {
    const id = await insert("running", "[10:00:00] a\n[10:00:01] b", ago(8));
    assert.deepEqual(await progress(id, {}), { cancel: false });
    const r = (await row(id))!;
    assert.equal(r.status, "running");
    assert.equal(r.logs, "[10:00:00] a\n[10:00:01] b");
    assert.ok(r.heartbeat_at && Date.parse(r.heartbeat_at) > Date.now() - 60_000);
  });

  it("ne ramène jamais un job done en running", async () => {
    const id = await insert("done");
    await progress(id, { status: "running", processed: 5 });
    await progress(id, {});
    const r = (await row(id))!;
    assert.equal(r.status, "done");
    assert.equal(r.processed, 0);
  });

  it("un job failed par le nettoyage reste failed et reçoit cancel: true", async () => {
    const id = await insert("running", null, ago(11));
    await failStaleJobs(db);
    assert.equal((await row(id))!.status, "failed");
    assert.deepEqual(await progress(id, { status: "running", log_entry: "tardif" }), { cancel: true });
    assert.deepEqual(await progress(id, {}), { cancel: true });
    const r = (await row(id))!;
    assert.equal(r.status, "failed");
    assert.equal(r.logs, null);
  });

  it("ajoute une ligne de log et tronque aux 300 dernières, en un seul UPDATE", async () => {
    const id = await insert("running");
    for (let i = 1; i <= 305; i++) await progress(id, { status: "running", log_entry: `l${i}` });
    const lines = (await row(id))!.logs!.split("\n");
    assert.equal(lines.length, MAX_LOG_LINES);
    assert.match(lines[0], /\] l6$/);
    assert.match(lines[299], /\] l305$/);
  });
});
