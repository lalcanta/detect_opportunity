/**
 * Envoi d'emails par l'application (services/emailOutbox.ts) : envoi depuis la fiche du closer, état de la file, et
 * routes du worker pour les adapters qui tournent sur le Mac (SMTP).
 */
import { Hono } from "hono";
import { opportunityIdOf } from "../../../shared/opportunities";
import { isEmailProviderId, WORKER_EMAIL_PROVIDERS, formatAddress } from "../../../shared/outreach/email";
import { bearerMatches, ensureAuthSchema, requireUser } from "../auth";
import { claimWorkerEmails, completeWorkerEmail, emailConfig, leadOutbox, sendLeadEmail, sentToday, type WorkerEmailResult } from "../services/emailOutbox";
import { parseAllowedOpportunities, type AppEnv, type OpportunityTypeId, type User } from "../types";

export const emailRoutes = new Hono<AppEnv>();

/** Un closer n'agit que sur ses leads et ses besoins. Renvoie le message d'erreur, ou null. */
async function forbiddenFor(db: D1Database, user: User, leadId: string): Promise<{ status: 403 | 404; message: string } | null> {
  const lead = await db.prepare("SELECT assigned_to, opportunity_type FROM leads WHERE id = ?").bind(leadId).first<{ assigned_to: string | null; opportunity_type: string | null }>();
  if (!lead) return { status: 404, message: "Lead introuvable." };
  if (user.role !== "closer") return null;
  if (lead.assigned_to && lead.assigned_to !== user.id) return { status: 403, message: "Ce lead ne vous est pas attribué." };
  const allowed = parseAllowedOpportunities(user.allowed_opportunities);
  if (!allowed.includes(opportunityIdOf(lead.opportunity_type) as OpportunityTypeId)) {
    return { status: 403, message: "Ce type d'opportunité n'est pas activé pour vous." };
  }
  return null;
}

/** GET /api/email/config — fournisseur d'envoi en vigueur et emails restants aujourd'hui. */
emailRoutes.get("/api/email/config", requireUser("closer"), async (c) => {
  await ensureAuthSchema(c.env.DB);
  const cfg = emailConfig(c.env);
  const used = cfg.provider === "manual" ? 0 : await sentToday(c.env.DB);
  return c.json({
    provider: cfg.provider,
    label: cfg.label,
    enabled: cfg.provider !== "manual" && !cfg.problem,
    problem: cfg.problem,
    from: cfg.from ? formatAddress(cfg.from) : null,
    daily_limit: cfg.dailyLimit,
    remaining_today: Math.max(0, cfg.dailyLimit - used),
    via_worker: WORKER_EMAIL_PROVIDERS.includes(cfg.provider),
  });
});

interface SendBody {
  to?: string;
  subject?: string;
  body?: string;
  template_id?: string;
}

/** POST /api/leads/:id/email-send — envoie (ou met en file) l'email relu par le closer. */
emailRoutes.post("/api/leads/:id/email-send", requireUser("closer"), async (c) => {
  await ensureAuthSchema(c.env.DB);
  const user = c.get("user");
  const id = c.req.param("id");
  const denied = await forbiddenFor(c.env.DB, user, id);
  if (denied) return c.json({ error: "forbidden", message: denied.message }, denied.status);
  const b = await c.req.json<SendBody>().catch(() => ({}) as SendBody);
  const outcome = await sendLeadEmail(c.env, {
    leadId: id,
    userId: user.id,
    to: String(b.to ?? ""),
    subject: String(b.subject ?? ""),
    body: String(b.body ?? ""),
    templateId: typeof b.template_id === "string" ? b.template_id.slice(0, 80) : null,
  });
  if (!outcome.ok) {
    const status = outcome.error === "daily_limit" ? 429 : outcome.error === "provider_error" ? 502 : 400;
    return c.json(outcome, status);
  }
  return c.json(outcome);
});

/** GET /api/leads/:id/emails — emails du lead passés par la file d'envoi. */
emailRoutes.get("/api/leads/:id/emails", requireUser("closer"), async (c) => {
  await ensureAuthSchema(c.env.DB);
  const id = c.req.param("id");
  const denied = await forbiddenFor(c.env.DB, c.get("user"), id);
  if (denied) return c.json({ error: "forbidden", message: denied.message }, denied.status);
  return c.json({ emails: await leadOutbox(c.env.DB, id) });
});

/** POST /api/worker/emails/claim — le worker réclame les emails de ses adapters, avec l'expéditeur configuré. */
emailRoutes.post("/api/worker/emails/claim", async (c) => {
  if (!bearerMatches(c.req.header("Authorization"), c.env.SYNC_SECRET_TOKEN)) return c.json({ error: "unauthorized" }, 401);
  await ensureAuthSchema(c.env.DB);
  const b = await c.req.json<{ providers?: unknown[] }>().catch(() => ({}) as { providers?: unknown[] });
  const providers = (b.providers ?? []).filter(isEmailProviderId).filter((p) => WORKER_EMAIL_PROVIDERS.includes(p));
  const cfg = emailConfig(c.env);
  const emails = await claimWorkerEmails(c.env.DB, providers);
  return c.json({
    from: cfg.from,
    reply_to: cfg.replyTo,
    emails: emails.map((e) => ({ id: e.id, lead_id: e.lead_id, provider: e.provider, to: e.to_email, subject: e.subject, text: e.body })),
  });
});

/** POST /api/worker/emails/:id/result — compte rendu d'envoi du worker. */
emailRoutes.post("/api/worker/emails/:id/result", async (c) => {
  if (!bearerMatches(c.req.header("Authorization"), c.env.SYNC_SECRET_TOKEN)) return c.json({ error: "unauthorized" }, 401);
  const id = Number.parseInt(c.req.param("id"), 10);
  if (!Number.isFinite(id)) return c.json({ error: "invalid_id" }, 400);
  const b = await c.req.json<WorkerEmailResult>().catch(() => null);
  if (!b || typeof b.ok !== "boolean") return c.json({ error: "invalid_payload" }, 400);
  const status = await completeWorkerEmail(c.env.DB, id, b);
  if (!status) return c.json({ error: "not_claimed" }, 409);
  return c.json({ ok: true, status });
});
