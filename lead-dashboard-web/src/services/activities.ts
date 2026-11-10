/**
 * Historique structuré des échanges d'un lead (docs/PLAN_REFONTE_LEADS.md §3.4, table lead_activities).
 * Chaque action garde son contenu complet : email envoyé (objet + corps), message de formulaire,
 * réponse reçue, issue d'appel, changement d'étape.
 */
import { isChannelId, type ChannelId } from "../../../shared/opportunities";

export const ACTIVITY_KINDS = ["call_outcome", "email_sent", "form_submitted", "reply_received", "note", "status_change"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/** Types qu'un utilisateur peut créer directement (les autres sont écrits par les routes métier). */
export const USER_ACTIVITY_KINDS: readonly ActivityKind[] = ["reply_received", "note"];

/** Taille maximale d'un contenu texte (corps d'email, réponse collée). */
export const ACTIVITY_TEXT_MAX = 20_000;

/** Doit rester identique à schema.sql et migrations/0005. */
export const LEAD_ACTIVITIES_DDL = `CREATE TABLE IF NOT EXISTS lead_activities (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id     TEXT NOT NULL REFERENCES leads(id),
  user_id     TEXT,
  kind        TEXT NOT NULL,
  channel     TEXT,
  summary     TEXT NOT NULL,
  content     TEXT,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;

export interface ActivityInput {
  leadId: string;
  userId: string | null;
  kind: ActivityKind;
  channel?: ChannelId | null;
  summary: string;
  content?: Record<string, unknown> | null;
}

export interface ActivityRow {
  id: number;
  lead_id: string;
  user_id: string | null;
  user_name: string | null;
  kind: ActivityKind;
  channel: ChannelId | null;
  summary: string;
  content: string | null;
  created_at: string;
}

export function activityStatement(db: D1Database, a: ActivityInput): D1PreparedStatement {
  return db
    .prepare("INSERT INTO lead_activities (lead_id, user_id, kind, channel, summary, content) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(
      a.leadId,
      a.userId,
      a.kind,
      a.channel ?? null,
      a.summary.slice(0, 300),
      a.content ? JSON.stringify(a.content).slice(0, ACTIVITY_TEXT_MAX + 2000) : null,
    );
}

export async function logActivity(db: D1Database, a: ActivityInput): Promise<void> {
  await activityStatement(db, a).run();
}

export async function listActivities(db: D1Database, leadId: string, limit = 200): Promise<ActivityRow[]> {
  const res = await db
    .prepare(
      `SELECT a.id, a.lead_id, a.user_id, u.name AS user_name, a.kind, a.channel, a.summary, a.content, a.created_at
       FROM lead_activities a LEFT JOIN users u ON u.id = a.user_id
       WHERE a.lead_id = ? ORDER BY a.created_at DESC, a.id DESC LIMIT ?`,
    )
    .bind(leadId, limit)
    .all<ActivityRow>();
  return res.results;
}

/** Texte saisi par l'utilisateur : chaîne non vide, bornée. */
export function cleanText(raw: unknown, max = ACTIVITY_TEXT_MAX): string {
  return typeof raw === "string" ? raw.trim().slice(0, max) : "";
}

/**
 * Activité créée depuis l'interface (réponse reçue, note).
 * Renvoie null si le type n'est pas autorisé ou si le texte est vide.
 */
export function parseUserActivity(
  raw: unknown,
): { kind: ActivityKind; channel: ChannelId | null; summary: string; content: Record<string, unknown> } | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const kind = b.kind as ActivityKind;
  if (!USER_ACTIVITY_KINDS.includes(kind)) return null;
  const text = cleanText(b.text);
  if (!text) return null;
  const channel = isChannelId(b.channel) ? b.channel : null;
  const from = cleanText(b.from, 200);
  if (kind === "reply_received") {
    const where = channel === "phone" ? "au téléphone" : channel === "contact_form" ? "via le formulaire" : "par email";
    return { kind, channel, summary: `Réponse reçue ${where}${from ? ` de ${from}` : ""}`, content: { text, from: from || null } };
  }
  return { kind, channel, summary: "Note", content: { text } };
}

const STATUS_LABELS: Record<string, string> = {
  pending_generation: "En génération",
  demo_ready: "À contacter",
  hot_lead: "Lead chaud",
  called: "Appelé",
  callback_scheduled: "Relance programmée",
  won: "Gagné",
  lost: "Perdu",
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}
