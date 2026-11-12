/**
 * File d'envoi des emails (port/adapters dans shared/outreach/email.ts).
 *
 * Le closer relit et clique « Envoyer » : l'email est inscrit dans `email_outbox`. Avec un adapter HTTP (Resend, Brevo)
 * il part tout de suite depuis le dashboard ; avec `smtp` il attend le worker local, qui le réclame, l'envoie et
 * rend compte. Un email parti est historisé comme un envoi manuel (notes, historique du lead). Le fournisseur se
 * choisit par la variable `EMAIL_PROVIDER` ; sans elle, rien n'est envoyé par l'application.
 */
import {
  brevoSender,
  isEmailProviderId,
  parseAddress,
  resendSender,
  validateOutgoingEmail,
  withOptOut,
  WORKER_EMAIL_PROVIDERS,
  EMAIL_PROVIDER_LABELS,
  type EmailAddress,
  type EmailProviderId,
  type EmailSender,
} from "../../../shared/outreach/email";
import type { Bindings } from "../types";
import { ACTIVITY_TEXT_MAX, cleanText, logActivity } from "./activities";

export const EMAIL_OUTBOX_DDL = `CREATE TABLE IF NOT EXISTS email_outbox (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id      TEXT NOT NULL,
  user_id      TEXT,
  provider     TEXT NOT NULL,
  to_email     TEXT NOT NULL,
  subject      TEXT NOT NULL,
  body         TEXT NOT NULL,
  template_id  TEXT,
  status       TEXT NOT NULL DEFAULT 'queued',
  attempts     INTEGER NOT NULL DEFAULT 0,
  error        TEXT,
  message_id   TEXT,
  created_at   TEXT NOT NULL,
  sent_at      TEXT
)`;
export const EMAIL_OUTBOX_INDEX = "CREATE INDEX IF NOT EXISTS idx_email_outbox_status ON email_outbox(status, provider, id)";

export const DEFAULT_DAILY_LIMIT = 30;
/** Essais d'envoi par le worker avant abandon. */
export const MAX_ATTEMPTS = 3;

export type OutboxStatus = "queued" | "sending" | "sent" | "failed";

export interface OutboxRow {
  id: number;
  lead_id: string;
  user_id: string | null;
  provider: EmailProviderId;
  to_email: string;
  subject: string;
  body: string;
  template_id: string | null;
  status: OutboxStatus;
  attempts: number;
  error: string | null;
  message_id: string | null;
  created_at: string;
  sent_at: string | null;
}

export interface EmailConfig {
  provider: EmailProviderId;
  label: string;
  from: EmailAddress | null;
  replyTo: string | null;
  dailyLimit: number;
  /** Configuration incomplète : l'envoi par l'application est désactivé. */
  problem: string | null;
}

type EmailEnv = Pick<Bindings, "EMAIL_PROVIDER" | "EMAIL_FROM" | "EMAIL_REPLY_TO" | "EMAIL_DAILY_LIMIT" | "RESEND_API_KEY" | "BREVO_API_KEY">;

export function emailConfig(env: EmailEnv): EmailConfig {
  const provider: EmailProviderId = isEmailProviderId(env.EMAIL_PROVIDER) ? env.EMAIL_PROVIDER : "manual";
  const from = parseAddress(env.EMAIL_FROM);
  const replyTo = parseAddress(env.EMAIL_REPLY_TO)?.email ?? null;
  const limit = Number.parseInt(env.EMAIL_DAILY_LIMIT ?? "", 10);
  let problem: string | null = null;
  if (provider !== "manual") {
    if (!from) problem = "EMAIL_FROM manquant ou invalide";
    else if (provider === "resend" && !env.RESEND_API_KEY) problem = "RESEND_API_KEY manquant";
    else if (provider === "brevo" && !env.BREVO_API_KEY) problem = "BREVO_API_KEY manquant";
  }
  return {
    provider,
    label: EMAIL_PROVIDER_LABELS[provider],
    from,
    replyTo,
    dailyLimit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 1000) : DEFAULT_DAILY_LIMIT,
    problem,
  };
}

/** Adapter du dashboard pour un fournisseur HTTP ; `null` pour `manual` et les fournisseurs du worker. */
export function dashboardSender(env: EmailEnv, provider: EmailProviderId, fetcher?: typeof fetch): EmailSender | null {
  if (provider === "resend" && env.RESEND_API_KEY) return resendSender(env.RESEND_API_KEY, fetcher);
  if (provider === "brevo" && env.BREVO_API_KEY) return brevoSender(env.BREVO_API_KEY, fetcher);
  return null;
}

/** Emails comptés dans la limite du jour (UTC) : partis ou en cours. */
export async function sentToday(db: D1Database, now = new Date()): Promise<number> {
  const day = now.toISOString().slice(0, 10);
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM email_outbox WHERE status IN ('queued','sending','sent') AND substr(created_at, 1, 10) = ?")
    .bind(day)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** Historise un email parti : notes du lead, adresse, attribution et historique (comme « Marquer comme envoyé »). */
export async function recordEmailSent(
  db: D1Database,
  p: { leadId: string; userId: string | null; to: string; subject: string; body: string; templateId?: string | null; provider?: EmailProviderId; messageId?: string | null },
): Promise<string | null> {
  const lead = await db.prepare("SELECT call_notes, email FROM leads WHERE id = ?").bind(p.leadId).first<{ call_notes: string | null; email: string | null }>();
  if (!lead) return null;
  const user = p.userId ? await db.prepare("SELECT name FROM users WHERE id = ?").bind(p.userId).first<{ name: string }>() : null;
  const by = user?.name ?? "l'application";
  const via = p.provider && p.provider !== "manual" ? ` via ${EMAIL_PROVIDER_LABELS[p.provider]}` : "";
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const entry = `[${stamp}] ✉️ Email envoyé par ${by}${via} à ${p.to} — « ${p.subject} »${p.templateId ? ` (modèle : ${p.templateId})` : ""}`;
  const notes = (lead.call_notes ? `${lead.call_notes}\n${entry}` : entry).slice(-4000);
  await db
    .prepare("UPDATE leads SET call_notes = ?1, email = ?2, assigned_to = COALESCE(assigned_to, ?3) WHERE id = ?4")
    .bind(notes, lead.email || p.to, p.userId, p.leadId)
    .run();
  await logActivity(db, {
    leadId: p.leadId,
    userId: p.userId,
    kind: "email_sent",
    channel: "email",
    summary: `Email envoyé${via} à ${p.to} — « ${p.subject} »`,
    content: {
      to: p.to,
      subject: p.subject,
      body: cleanText(p.body, ACTIVITY_TEXT_MAX),
      template_id: p.templateId ?? null,
      provider: p.provider ?? "manual",
      message_id: p.messageId ?? null,
    },
  });
  return notes;
}

export type SendOutcome =
  | { ok: true; status: "sent" | "queued"; outboxId: number; call_notes?: string | null }
  | { ok: false; error: "manual" | "misconfigured" | "daily_limit" | "invalid" | "provider_error"; message: string; outboxId?: number };

/** Envoie (adapter HTTP) ou met en file (worker) l'email relu par le closer. */
export async function sendLeadEmail(
  env: EmailEnv & { DB: D1Database },
  p: { leadId: string; userId: string; to: string; subject: string; body: string; templateId?: string | null },
  fetcher?: typeof fetch,
): Promise<SendOutcome> {
  const cfg = emailConfig(env);
  if (cfg.provider === "manual") return { ok: false, error: "manual", message: "Envoi par l'application désactivé : utilisez votre client mail." };
  if (cfg.problem || !cfg.from) return { ok: false, error: "misconfigured", message: `Envoi non configuré : ${cfg.problem}` };

  const text = withOptOut(p.body);
  const email = { from: cfg.from, to: p.to.trim(), subject: p.subject.trim(), text, replyTo: cfg.replyTo ?? undefined, leadId: p.leadId };
  const errors = validateOutgoingEmail(email);
  if (errors.length) return { ok: false, error: "invalid", message: `Email refusé : ${errors.join(", ")}.` };

  const count = await sentToday(env.DB);
  if (count >= cfg.dailyLimit) {
    return { ok: false, error: "daily_limit", message: `Limite de ${cfg.dailyLimit} emails par jour atteinte : reprise demain.` };
  }

  const viaWorker = WORKER_EMAIL_PROVIDERS.includes(cfg.provider);
  const inserted = await env.DB.prepare(
    `INSERT INTO email_outbox (lead_id, user_id, provider, to_email, subject, body, template_id, status, attempts, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10) RETURNING id`,
  )
    .bind(p.leadId, p.userId, cfg.provider, email.to, email.subject, text, p.templateId ?? null, viaWorker ? "queued" : "sending", viaWorker ? 0 : 1, new Date().toISOString())
    .first<{ id: number }>();
  const outboxId = inserted!.id;
  if (viaWorker) return { ok: true, status: "queued", outboxId };

  const sender = dashboardSender(env, cfg.provider, fetcher);
  const result = sender ? await sender.send(email) : { ok: false as const, provider: cfg.provider, error: "adapter indisponible", retryable: false };
  if (!result.ok) {
    await env.DB.prepare("UPDATE email_outbox SET status = 'failed', error = ? WHERE id = ?").bind(result.error.slice(0, 500), outboxId).run();
    return { ok: false, error: "provider_error", message: `${cfg.label} a refusé l'envoi : ${result.error}`, outboxId };
  }
  await env.DB.prepare("UPDATE email_outbox SET status = 'sent', message_id = ?, sent_at = ? WHERE id = ?")
    .bind(result.messageId, new Date().toISOString(), outboxId)
    .run();
  const notes = await recordEmailSent(env.DB, { ...p, to: email.to, subject: email.subject, body: text, provider: cfg.provider, messageId: result.messageId });
  return { ok: true, status: "sent", outboxId, call_notes: notes };
}

/** Le worker réclame les emails en attente pour ses adapters (atomique). */
export async function claimWorkerEmails(db: D1Database, providers: readonly EmailProviderId[], limit = 5): Promise<OutboxRow[]> {
  if (providers.length === 0) return [];
  const placeholders = providers.map(() => "?").join(",");
  const res = await db
    .prepare(
      `UPDATE email_outbox SET status = 'sending', attempts = attempts + 1
       WHERE id IN (SELECT id FROM email_outbox WHERE status = 'queued' AND provider IN (${placeholders}) ORDER BY id LIMIT ?)
       RETURNING *`,
    )
    .bind(...providers, limit)
    .all<OutboxRow>();
  return res.results ?? [];
}

export interface WorkerEmailResult {
  ok: boolean;
  messageId?: string | null;
  error?: string;
  retryable?: boolean;
}

/** Compte rendu du worker pour un email réclamé. */
export async function completeWorkerEmail(db: D1Database, id: number, r: WorkerEmailResult): Promise<OutboxStatus | null> {
  const row = await db.prepare("SELECT * FROM email_outbox WHERE id = ?").bind(id).first<OutboxRow>();
  if (!row || row.status !== "sending") return null;
  if (r.ok) {
    await db.prepare("UPDATE email_outbox SET status = 'sent', message_id = ?, sent_at = ?, error = NULL WHERE id = ?")
      .bind(r.messageId ?? null, new Date().toISOString(), id)
      .run();
    await recordEmailSent(db, {
      leadId: row.lead_id,
      userId: row.user_id,
      to: row.to_email,
      subject: row.subject,
      body: row.body,
      templateId: row.template_id,
      provider: row.provider,
      messageId: r.messageId ?? null,
    });
    return "sent";
  }
  const status: OutboxStatus = r.retryable && row.attempts < MAX_ATTEMPTS ? "queued" : "failed";
  await db.prepare("UPDATE email_outbox SET status = ?, error = ? WHERE id = ?").bind(status, (r.error ?? "erreur inconnue").slice(0, 500), id).run();
  return status;
}

/** Derniers emails d'un lead passés par la file (état affiché au closer). */
export async function leadOutbox(db: D1Database, leadId: string): Promise<Pick<OutboxRow, "id" | "status" | "to_email" | "subject" | "error" | "created_at" | "sent_at" | "provider">[]> {
  const res = await db
    .prepare("SELECT id, status, to_email, subject, error, created_at, sent_at, provider FROM email_outbox WHERE lead_id = ? ORDER BY id DESC LIMIT 10")
    .bind(leadId)
    .all<Pick<OutboxRow, "id" | "status" | "to_email" | "subject" | "error" | "created_at" | "sent_at" | "provider">>();
  return res.results ?? [];
}
