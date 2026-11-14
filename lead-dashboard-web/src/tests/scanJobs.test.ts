import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { after, before } from "node:test";
import { getPlatformProxy } from "wrangler";
import { Hono } from "hono";
import type { AppEnv } from "../types";
import { scanRoutes } from "../routes/scans";
import { backfillRunningHeartbeats, ensureAuthSchema } from "../auth";
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
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ DB: D1Database }>>>;
  let db: D1Database;
  let app: Hono<AppEnv>;
  const TOKEN = "secret-test";

  before(async () => {
    // D1 en mémoire (wrangler.local.toml ne déclare que DB) ; un proxy par suite = une base vierge.
    proxy = await getPlatformProxy<{ DB: D1Database }>({ configPath: fileURLToPath(new URL("../../wrangler.local.toml", import.meta.url)), persist: false });
    db = proxy.env.DB;
    const ddl = /CREATE TABLE IF NOT EXISTS scan_jobs \([\s\S]*?\n\);/.exec(readFileSync(new URL("../../schema.sql", import.meta.url), "utf8"))![0];
    await db.prepare(ddl.replace(/--[^\n]*/g, "").replace(/\s+/g, " ")).run();
    app = new Hono<AppEnv>();
    app.route("/", scanRoutes);
  });
  after(async () => {
    await proxy.dispose();
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

describe("« Lancer maintenant » et last_run_at (D1 réelle via miniflare)", () => {
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ DB: D1Database }>>>;
  let db: D1Database;
  let app: Hono<AppEnv>;

  before(async () => {
    // D1 en mémoire (wrangler.local.toml ne déclare que DB) ; un proxy par suite = une base vierge.
    proxy = await getPlatformProxy<{ DB: D1Database }>({ configPath: fileURLToPath(new URL("../../wrangler.local.toml", import.meta.url)), persist: false });
    db = proxy.env.DB;
    const schema = readFileSync(new URL("../../schema.sql", import.meta.url), "utf8");
    for (const table of ["users", "scan_jobs", "scheduled_scans"]) {
      const ddl = new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\([\\s\\S]*?\\n\\);`).exec(schema)![0];
      await db.prepare(ddl.replace(/--[^\n]*/g, "").replace(/\s+/g, " ")).run();
    }
    await ensureAuthSchema(db);
    await db.prepare("INSERT INTO users (name, email, invite_code, access_token, role, is_active) VALUES ('Admin','a@x.fr','inv','tok-admin','admin',1)").run();
    await db.prepare("INSERT INTO scheduled_scans (id, label, cron_expr, query, city, last_run_at) VALUES (1,'Test','x','plombier','Lyon','2026-11-10T07:31:00.000Z')").run();
    app = new Hono<AppEnv>();
    app.route("/", scanRoutes);
  });
  after(async () => {
    await proxy.dispose();
  });

  const lastRun = async () => (await db.prepare("SELECT last_run_at FROM scheduled_scans WHERE id = 1").first<{ last_run_at: string | null }>())!.last_run_at;

  it("run-now crée le job sans toucher à last_run_at", async () => {
    const res = await app.request("/api/admin/scheduled-scans/1/run-now", { method: "POST", headers: { Cookie: "lead_session=tok-admin" } }, { DB: db });
    assert.equal(res.status, 200);
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM scan_jobs").first<{ n: number }>())!.n, 1);
    assert.equal(await lastRun(), "2026-11-10T07:31:00.000Z");
  });

  it("le déclenchement planifié (/trigger) écrit last_run_at", async () => {
    const res = await app.request("/api/worker/scheduled-scans/1/trigger", { method: "POST", headers: { Authorization: "Bearer secret-test" } }, { DB: db, SYNC_SECRET_TOKEN: "secret-test" });
    assert.equal(res.status, 200);
    assert.ok(Date.parse((await lastRun())!) > Date.now() - 60_000);
  });
});

describe("migration v17 : battement des jobs déjà en cours (D1 réelle via miniflare)", () => {
  it("ensureAuthSchema appelle le remplissage juste après les ALTER TABLE", () => {
    const src = readFileSync(new URL("../auth.ts", import.meta.url), "utf8");
    assert.ok(src.indexOf("ADD COLUMN heartbeat_at") < src.indexOf("await backfillRunningHeartbeats(db);"));
  });

  it("donne un battement aux jobs running qui n'en ont pas, sans toucher aux autres", async () => {
    const proxy = await getPlatformProxy<{ DB: D1Database }>({ configPath: fileURLToPath(new URL("../../wrangler.local.toml", import.meta.url)), persist: false });
    try {
      const db = proxy.env.DB;
      const schema = readFileSync(new URL("../../schema.sql", import.meta.url), "utf8");
      const ddl = /CREATE TABLE IF NOT EXISTS scan_jobs \([\s\S]*?\n\);/.exec(schema)![0];
      await db.prepare(ddl.replace(/--[^\n]*/g, "").replace(/\s+/g, " ")).run();
      const old = "2026-01-01 00:00:00";
      await db.prepare("INSERT INTO scan_jobs (id, query, city, status, started_at, heartbeat_at) VALUES (1,'q','c','running',?1,NULL), (2,'q','c','queued',?1,NULL), (3,'q','c','running',?1,?1)").bind(old).run();
      await backfillRunningHeartbeats(db);
      const hb = async (id: number) => (await db.prepare("SELECT heartbeat_at FROM scan_jobs WHERE id = ?1").bind(id).first<{ heartbeat_at: string | null }>())!.heartbeat_at;
      assert.ok(Date.parse((await hb(1))!.replace(" ", "T") + "Z") > Date.now() - 60_000, "running sans battement : rempli");
      assert.equal(await hb(2), null);
      assert.equal(await hb(3), old);
    } finally {
      await proxy.dispose();
    }
  });
});
