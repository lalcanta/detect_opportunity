/**
 * Besoins (opportunités) éditables : API de l'onglet admin « Besoins » et lecture par le worker.
 */
import { Hono } from "hono";
import { bearerMatches, requireUser } from "../auth";
import { validateOpportunityDefinition } from "../../../shared/opportunities";
import { opportunityHistory, readStoredOpportunities, saveOpportunityDefinition } from "../services/opportunityStore";
import type { AppEnv } from "../types";

export const opportunityRoutes = new Hono<AppEnv>();

/** Nom affiché des auteurs de modifications ; « code » désigne le remplissage initial. */
async function userNames(db: D1Database): Promise<Map<string, string>> {
  const res = await db.prepare("SELECT id, name FROM users").all<{ id: string; name: string }>();
  const map = new Map(res.results.map((u) => [u.id, u.name]));
  map.set("code", "code");
  return map;
}

/** Définitions en vigueur pour le worker (sync-queue, prep lancés hors d'un job). */
opportunityRoutes.get("/api/worker/opportunities", async (c) => {
  if (!bearerMatches(c.req.header("Authorization"), c.env.SYNC_SECRET_TOKEN)) return c.json({ error: "unauthorized" }, 401);
  const rows = await readStoredOpportunities(c.env.DB);
  return c.json({ opportunities: rows.map((r) => ({ ...r.def, version: r.version })) });
});

/** Définitions, versions et nombre de leads par besoin. */
opportunityRoutes.get("/api/admin/opportunities", requireUser("admin"), async (c) => {
  const rows = await readStoredOpportunities(c.env.DB);
  const counts = await c.env.DB.prepare("SELECT opportunity_type AS id, COUNT(*) AS n FROM leads GROUP BY opportunity_type").all<{ id: string | null; n: number }>();
  const byId = new Map(counts.results.map((r) => [r.id ?? "", r.n]));
  const names = await userNames(c.env.DB);
  return c.json({
    opportunities: rows.map((r) => ({
      def: r.def,
      version: r.version,
      updated_at: r.updated_at,
      updated_by: r.updated_by ? (names.get(r.updated_by) ?? r.updated_by) : null,
      leads: byId.get(r.def.id) ?? 0,
    })),
  });
});

opportunityRoutes.get("/api/admin/opportunities/:id/history", requireUser("admin"), async (c) => {
  const names = await userNames(c.env.DB);
  const history = await opportunityHistory(c.env.DB, c.req.param("id"));
  return c.json({ history: history.map((h) => ({ ...h, changed_by: h.changed_by ? (names.get(h.changed_by) ?? h.changed_by) : null })) });
});

/** Création (`version: 0`) ou modification d'un besoin. */
opportunityRoutes.post("/api/admin/opportunities", requireUser("admin"), async (c) => {
  const body = await c.req.json<{ definition?: unknown; version?: number }>().catch(() => ({}) as { definition?: unknown; version?: number });
  const version = Number.isInteger(body.version) ? (body.version as number) : -1;
  if (version < 0) return c.json({ ok: false, errors: ["version manquante"] }, 400);
  const res = await saveOpportunityDefinition(c.env.DB, body.definition, version, c.get("user").id);
  if (!res.ok) return c.json({ ok: false, errors: res.errors }, res.status);
  return c.json({ ok: true, version: res.version });
});

/** Validation en direct du formulaire d'édition (mêmes règles que l'enregistrement). */
opportunityRoutes.post("/api/admin/opportunities/validate", requireUser("admin"), async (c) => {
  const body = await c.req.json<{ definition?: unknown }>().catch(() => ({}) as { definition?: unknown });
  const res = validateOpportunityDefinition(body.definition);
  return c.json(res.ok ? { ok: true, errors: [] } : { ok: false, errors: res.errors });
});
