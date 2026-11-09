import { Hono } from "hono";
import type { AppEnv } from "../types";
import { bearerMatches, requireUser } from "../auth";

export const scanRoutes = new Hono<AppEnv>();

export interface ScanJob {
  id: number;
  query: string;
  city: string;
  lead_limit: number;
  use_cdp: number;
  lat?: number | null;
  lng?: number | null;
  radius_km?: number | null;
  opportunity_type?: string | null;
  website_filter?: string | null;
  execution_mode?: "full_auto" | "prep_only" | null;
  status: "queued" | "running" | "done" | "failed" | "cancelled";
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  processed: number;
  total: number;
  message: string | null;
}

export interface ScheduledScan {
  id: number;
  label: string;
  cron_expr: string;
  time_of_day: string;
  days_of_week: string;
  query: string;
  city: string;
  lead_limit: number;
  use_cdp: number;
  lat?: number | null;
  lng?: number | null;
  radius_km?: number | null;
  opportunity_type: string;
  website_filter: string;
  execution_mode?: "full_auto" | "prep_only" | null;
  is_active: number;
  last_run_at?: string | null;
  next_run_at?: string | null;
  created_by?: string | null;
  created_at: string;
}

/* ---------- Admin ---------- */

interface ScanCreateBody {
  query?: string;
  city?: string;
  limit?: number;
  cdp?: boolean;
  lat?: number;
  lng?: number;
  radius_km?: number;
  opportunity_type?: string;
  website_filter?: string;
  execution_mode?: "full_auto" | "prep_only";
}

scanRoutes.post("/api/admin/scans", requireUser("admin"), async (c) => {
  const b = await c.req.json<ScanCreateBody>().catch(() => ({} as ScanCreateBody));
  const query = (b.query?.trim() || "artisans, commerces").slice(0, 2000);
  const city = (b.city?.trim() || (b.lat && b.lng ? `Zone [${b.lat.toFixed(3)}, ${b.lng.toFixed(3)}]` : "France")).slice(0, 80);
  const limit = Math.min(Math.max(Math.trunc(b.limit ?? 10), 1), 100);
  const lat = typeof b.lat === "number" ? b.lat : null;
  const lng = typeof b.lng === "number" ? b.lng : null;
  const radius_km = typeof b.radius_km === "number" ? b.radius_km : null;
  const oppType = b.opportunity_type?.trim() || "website";
  const webFilter = b.website_filter?.trim() || "all";
  const execMode = b.execution_mode === "prep_only" ? "prep_only" : "full_auto";

  const res = await c.env.DB.prepare(
    "INSERT INTO scan_jobs (query, city, lead_limit, use_cdp, lat, lng, radius_km, opportunity_type, website_filter, execution_mode, requested_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
  )
    .bind(query, city, limit, b.cdp ? 1 : 0, lat, lng, radius_km, oppType, webFilter, execMode, c.get("user").id)
    .run();
  return c.json({ ok: true, id: res.meta.last_row_id });
});

scanRoutes.get("/api/admin/scans", requireUser("admin"), async (c) => c.json(await listScans(c.env.DB)));

scanRoutes.post("/api/admin/scans/:id/cancel", requireUser("admin"), async (c) => {
  await c.env.DB.prepare(
    `UPDATE scan_jobs SET status = 'cancelled', finished_at = ?, message = 'Annulé par l''admin'
     WHERE id = ? AND status IN ('queued','running')`,
  )
    .bind(new Date().toISOString(), c.req.param("id"))
    .run();
  return c.json({ ok: true });
});

export async function listScans(db: D1Database): Promise<ScanJob[]> {
  const r = await db.prepare("SELECT * FROM scan_jobs ORDER BY id DESC LIMIT 15").all<ScanJob>();
  return r.results;
}

export async function listScheduledScans(db: D1Database): Promise<ScheduledScan[]> {
  const r = await db.prepare("SELECT * FROM scheduled_scans ORDER BY id DESC").all<ScheduledScan>();
  return r.results;
}

/* ---------- Programmations Récurrentes (Scheduled Scans) ---------- */

interface ScheduledScanCreateBody {
  label?: string;
  time_of_day?: string;
  days_of_week?: string;
  query?: string;
  city?: string;
  limit?: number;
  cdp?: boolean;
  lat?: number;
  lng?: number;
  radius_km?: number;
  opportunity_type?: string;
  website_filter?: string;
  execution_mode?: "full_auto" | "prep_only";
}

scanRoutes.get("/api/admin/scheduled-scans", requireUser("admin"), async (c) => {
  return c.json(await listScheduledScans(c.env.DB));
});

scanRoutes.post("/api/admin/scheduled-scans", requireUser("admin"), async (c) => {
  const b = await c.req.json<ScheduledScanCreateBody>().catch(() => ({} as ScheduledScanCreateBody));
  const label = (b.label?.trim() || "Scan Quotidien").slice(0, 100);
  const timeOfDay = (b.time_of_day?.trim() || "08:30").slice(0, 5);
  const daysOfWeek = (b.days_of_week?.trim() || "1,2,3,4,5").slice(0, 30);
  const query = (b.query?.trim() || "artisans, commerces").slice(0, 2000);
  const city = (b.city?.trim() || "France").slice(0, 80);
  const limit = Math.min(Math.max(Math.trunc(b.limit ?? 10), 1), 100);
  const lat = typeof b.lat === "number" ? b.lat : null;
  const lng = typeof b.lng === "number" ? b.lng : null;
  const radius_km = typeof b.radius_km === "number" ? b.radius_km : null;
  const oppType = b.opportunity_type?.trim() || "website";
  const webFilter = b.website_filter?.trim() || "all";
  const execMode = b.execution_mode === "prep_only" ? "prep_only" : "full_auto";

  // Construction d'une expression cron standard
  const [hh, mm] = timeOfDay.split(":").map((v) => Number.parseInt(v, 10) || 0);
  const cronExpr = `${mm} ${hh} * * ${daysOfWeek === "*" ? "*" : daysOfWeek}`;

  const res = await c.env.DB.prepare(
    `INSERT INTO scheduled_scans
      (label, cron_expr, time_of_day, days_of_week, query, city, lead_limit, use_cdp, lat, lng, radius_km, opportunity_type, website_filter, execution_mode, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(label, cronExpr, timeOfDay, daysOfWeek, query, city, limit, b.cdp ? 1 : 0, lat, lng, radius_km, oppType, webFilter, execMode, c.get("user").id)
    .run();

  return c.json({ ok: true, id: res.meta.last_row_id });
});

scanRoutes.post("/api/admin/scheduled-scans/:id/toggle", requireUser("admin"), async (c) => {
  const id = c.req.param("id");
  await c.env.DB.prepare(
    "UPDATE scheduled_scans SET is_active = 1 - is_active WHERE id = ?",
  )
    .bind(id)
    .run();
  return c.json({ ok: true });
});

scanRoutes.post("/api/admin/scheduled-scans/:id/delete", requireUser("admin"), async (c) => {
  const id = c.req.param("id");
  await c.env.DB.prepare("DELETE FROM scheduled_scans WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

scanRoutes.post("/api/admin/scheduled-scans/:id/run-now", requireUser("admin"), async (c) => {
  const id = c.req.param("id");
  const s = await c.env.DB.prepare("SELECT * FROM scheduled_scans WHERE id = ?").bind(id).first<ScheduledScan>();
  if (!s) return c.json({ error: "not_found" }, 404);

  const res = await c.env.DB.prepare(
    `INSERT INTO scan_jobs
      (query, city, lead_limit, use_cdp, lat, lng, radius_km, opportunity_type, website_filter, execution_mode, requested_by, message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      s.query,
      s.city,
      s.lead_limit,
      s.use_cdp,
      s.lat,
      s.lng,
      s.radius_km,
      s.opportunity_type,
      s.website_filter,
      s.execution_mode || "full_auto",
      c.get("user").id,
      `Déclenché immédiatement depuis la planification "${s.label}" (${s.execution_mode === "prep_only" ? "Préparation CLI 0€" : "Cycle Complet"})`,
    )
    .run();

  await c.env.DB.prepare("UPDATE scheduled_scans SET last_run_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), id)
    .run();

  return c.json({ ok: true, job_id: res.meta.last_row_id });
});

/* ---------- Worker (Mac) : Bearer SYNC_SECRET_TOKEN ---------- */

/** Récupère la liste des scans récurrents actifs pour que le worker puisse déclencher ceux arrivés à échéance. */
scanRoutes.get("/api/worker/scheduled-scans", async (c) => {
  if (!bearerMatches(c.req.header("Authorization"), c.env.SYNC_SECRET_TOKEN)) return c.json({ error: "unauthorized" }, 401);
  const r = await c.env.DB.prepare(
    "SELECT * FROM scheduled_scans WHERE is_active = 1",
  ).all<ScheduledScan>();
  return c.json({ scheduled: r.results });
});

/** Le worker signale le déclenchement d'un scan récurrent : insère le job et met à jour last_run_at. */
scanRoutes.post("/api/worker/scheduled-scans/:id/trigger", async (c) => {
  if (!bearerMatches(c.req.header("Authorization"), c.env.SYNC_SECRET_TOKEN)) return c.json({ error: "unauthorized" }, 401);
  const id = c.req.param("id");
  const s = await c.env.DB.prepare("SELECT * FROM scheduled_scans WHERE id = ? AND is_active = 1").bind(id).first<ScheduledScan>();
  if (!s) return c.json({ error: "not_found" }, 404);

  const res = await c.env.DB.prepare(
    `INSERT INTO scan_jobs
      (query, city, lead_limit, use_cdp, lat, lng, radius_km, opportunity_type, website_filter, execution_mode, requested_by, message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      s.query,
      s.city,
      s.lead_limit,
      s.use_cdp,
      s.lat,
      s.lng,
      s.radius_km,
      s.opportunity_type,
      s.website_filter,
      s.execution_mode || "full_auto",
      s.created_by || "system_scheduler",
      `Déclenché automatiquement par la planification "${s.label}" (${s.execution_mode === "prep_only" ? "Préparation CLI 0€" : "Cycle Complet"})`,
    )
    .run();

  const now = new Date().toISOString();
  await c.env.DB.prepare("UPDATE scheduled_scans SET last_run_at = ? WHERE id = ?")
    .bind(now, id)
    .run();

  return c.json({ ok: true, job_id: res.meta.last_row_id });
});

/** Le worker réclame le plus ancien job en attente (atomique). */
scanRoutes.post("/api/worker/claim", async (c) => {
  if (!bearerMatches(c.req.header("Authorization"), c.env.SYNC_SECRET_TOKEN)) return c.json({ error: "unauthorized" }, 401);
  const job = await c.env.DB.prepare(
    `UPDATE scan_jobs SET status = 'running', started_at = ?
     WHERE id = (SELECT id FROM scan_jobs WHERE status = 'queued' ORDER BY id LIMIT 1)
     RETURNING *`,
  )
    .bind(new Date().toISOString())
    .first<ScanJob>();
  const models = await c.env.DB.prepare("SELECT action_type, provider, model, thinking_budget FROM model_settings").all();
  return c.json({ job: job ?? null, models: models.results });
});

interface ProgressBody {
  status?: "running" | "done" | "failed";
  processed?: number;
  total?: number;
  message?: string;
}

/** Progression ; la réponse indique au worker si l'admin a annulé. */
scanRoutes.post("/api/worker/jobs/:id/progress", async (c) => {
  if (!bearerMatches(c.req.header("Authorization"), c.env.SYNC_SECRET_TOKEN)) return c.json({ error: "unauthorized" }, 401);
  const id = c.req.param("id");
  const b = await c.req.json<ProgressBody>().catch(() => ({}) as ProgressBody);
  const cur = await c.env.DB.prepare("SELECT status FROM scan_jobs WHERE id = ?").bind(id).first<{ status: string }>();
  if (!cur) return c.json({ error: "not_found" }, 404);
  if (cur.status === "cancelled") return c.json({ cancel: true });

  const finished = b.status === "done" || b.status === "failed";
  await c.env.DB.prepare(
    `UPDATE scan_jobs SET status = COALESCE(?1, status), processed = COALESCE(?2, processed),
       total = COALESCE(?3, total), message = COALESCE(?4, message),
       finished_at = CASE WHEN ?5 = 1 THEN ?6 ELSE finished_at END WHERE id = ?7`,
  )
    .bind(b.status ?? null, b.processed ?? null, b.total ?? null, b.message?.slice(0, 500) ?? null, finished ? 1 : 0, new Date().toISOString(), id)
    .run();
  return c.json({ cancel: false });
});

/** Exécute un modèle Cloudflare Workers AI via le binding c.env.AI pour 0€ */
scanRoutes.post("/api/worker/ai/run", async (c) => {
  if (!bearerMatches(c.req.header("Authorization"), c.env.SYNC_SECRET_TOKEN)) return c.json({ error: "unauthorized" }, 401);
  const body = await c.req.json<{ model?: string; prompt?: string; system?: string }>().catch(() => ({} as { model?: string; prompt?: string; system?: string }));
  if (!c.env.AI) return c.json({ error: "no_ai_binding" }, 503);
  try {
    const messages: Array<{ role: string; content: string }> = [];
    if (body.system) messages.push({ role: "system", content: body.system });
    messages.push({ role: "user", content: body.prompt || "" });
    const aiRes = await c.env.AI.run(body.model || "@cf/meta/llama-3.1-8b-instruct-fp8", { messages });
    const text = typeof aiRes === "string" ? aiRes : (aiRes?.response || JSON.stringify(aiRes));
    return c.json({ ok: true, text });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});
