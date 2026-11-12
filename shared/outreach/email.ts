/**
 * Envoi d'emails : un port (`EmailSender`) et ses adapters.
 *
 * - `manual` : rien n'est envoyé par l'application, le closer passe par son client mail (`mailto:`) puis « Marquer
 *   comme envoyé ». C'est le choix par défaut.
 * - `smtp` : la boîte du domaine d'envoi, via le worker Node (les Workers Cloudflare gèrent mal le SMTP).
 * - `resend`, `brevo` : API HTTP, utilisables depuis le dashboard comme depuis le worker.
 *
 * Ce module est pur (fetch injecté) : la validation, la mention d'opposition et les adapters HTTP sont partagés.
 */

export const EMAIL_PROVIDER_IDS = ["manual", "smtp", "resend", "brevo"] as const;
export type EmailProviderId = (typeof EMAIL_PROVIDER_IDS)[number];

export const EMAIL_PROVIDER_LABELS: Record<EmailProviderId, string> = {
  manual: "Client mail du closer",
  smtp: "Boîte du domaine d'envoi (SMTP)",
  resend: "Resend",
  brevo: "Brevo",
};

/** Adapters qui tournent dans le worker local et non dans le dashboard. */
export const WORKER_EMAIL_PROVIDERS: readonly EmailProviderId[] = ["smtp"];

export const isEmailProviderId = (v: unknown): v is EmailProviderId =>
  typeof v === "string" && (EMAIL_PROVIDER_IDS as readonly string[]).includes(v);

export interface EmailAddress {
  email: string;
  name?: string;
}

export interface OutgoingEmail {
  from: EmailAddress;
  to: string;
  subject: string;
  /** Texte brut : un email de prospection personnel n'a pas besoin de HTML. */
  text: string;
  replyTo?: string;
  /** Identifiant interne, repris dans un en-tête pour relier rebonds et réponses au lead. */
  leadId?: string;
}

export type SendResult =
  | { ok: true; provider: EmailProviderId; messageId: string | null }
  | { ok: false; provider: EmailProviderId; error: string; /** Vrai si un nouvel essai a du sens (réseau, quota). */ retryable: boolean };

/** Le port. */
export interface EmailSender {
  readonly provider: EmailProviderId;
  send(email: OutgoingEmail): Promise<SendResult>;
}

export const SUBJECT_MAX = 200;
export const BODY_MAX = 10_000;
const EMAIL_RE = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[a-z]{2,}$/i;

export const isEmailAddress = (v: unknown): v is string => typeof v === "string" && v.length <= 254 && EMAIL_RE.test(v.trim());

/** Mention d'opposition : la prospection B2B par email doit permettre de refuser simplement les messages suivants. */
export const OPT_OUT_LINE = "Si vous ne souhaitez plus recevoir de message de ma part, répondez simplement « STOP ».";
const OPT_OUT_RE = /\bstop\b|désinscri|desinscri|ne plus recevoir|ne souhaitez plus/i;

export function hasOptOut(text: string): boolean {
  return OPT_OUT_RE.test(text);
}

/** Ajoute la mention d'opposition si le message n'en a pas. */
export function withOptOut(text: string): string {
  const t = text.replace(/\s+$/, "");
  return hasOptOut(t) ? t : `${t}\n\n--\n${OPT_OUT_LINE}`;
}

/** Erreurs bloquantes avant envoi. */
export function validateOutgoingEmail(e: Pick<OutgoingEmail, "to" | "subject" | "text" | "from">): string[] {
  const errors: string[] = [];
  if (!isEmailAddress(e.to)) errors.push("destinataire invalide");
  if (!isEmailAddress(e.from.email)) errors.push("expéditeur non configuré ou invalide");
  const subject = e.subject.trim();
  if (!subject) errors.push("objet vide");
  else if (subject.length > SUBJECT_MAX) errors.push(`objet trop long (${SUBJECT_MAX} caractères maximum)`);
  if (/[\r\n]/.test(e.subject)) errors.push("objet sur plusieurs lignes");
  const text = e.text.trim();
  if (!text) errors.push("message vide");
  else if (text.length > BODY_MAX) errors.push(`message trop long (${BODY_MAX} caractères maximum)`);
  if (/\{\{[^}]+\}\}/.test(e.subject + e.text)) errors.push("variables du modèle non remplacées");
  return errors;
}

export const formatAddress = (a: EmailAddress): string => (a.name ? `"${a.name.replace(/["\\]/g, "")}" <${a.email}>` : a.email);

/** En-têtes communs : désinscription par retour de mail, et lien vers le lead. */
export function outreachHeaders(e: OutgoingEmail): Record<string, string> {
  const unsubscribe = e.replyTo ?? e.from.email;
  return {
    "List-Unsubscribe": `<mailto:${unsubscribe}?subject=STOP>`,
    ...(e.leadId ? { "X-Lead-Id": e.leadId } : {}),
  };
}

/** Lit l'adresse d'expéditeur depuis « Nom <adresse> » ou « adresse ». */
export function parseAddress(raw: string | undefined | null): EmailAddress | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const m = s.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  const email = (m ? m[2]! : s).trim();
  if (!isEmailAddress(email)) return null;
  const name = m?.[1]?.trim();
  return name ? { email, name } : { email };
}

const retryableStatus = (status: number): boolean => status === 429 || status >= 500;

async function errorText(res: Response): Promise<string> {
  const body = await res.text().catch(() => "");
  try {
    const j = JSON.parse(body) as { message?: string; error?: string; name?: string };
    return `HTTP ${res.status} : ${j.message ?? j.error ?? j.name ?? body}`.slice(0, 300);
  } catch {
    return `HTTP ${res.status}${body ? ` : ${body}` : ""}`.slice(0, 300);
  }
}

/** Adapter Resend (https://resend.com/docs/api-reference/emails/send-email). */
export function resendSender(apiKey: string, fetcher: typeof fetch = fetch): EmailSender {
  return {
    provider: "resend",
    async send(e) {
      try {
        const res = await fetcher("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: formatAddress(e.from),
            to: [e.to],
            subject: e.subject,
            text: e.text,
            ...(e.replyTo ? { reply_to: e.replyTo } : {}),
            headers: outreachHeaders(e),
          }),
        });
        if (!res.ok) return { ok: false, provider: "resend", error: await errorText(res), retryable: retryableStatus(res.status) };
        const j = (await res.json().catch(() => ({}))) as { id?: string };
        return { ok: true, provider: "resend", messageId: j.id ?? null };
      } catch (err) {
        return { ok: false, provider: "resend", error: (err as Error).message, retryable: true };
      }
    },
  };
}

/** Adapter Brevo (https://developers.brevo.com/reference/sendtransacemail). */
export function brevoSender(apiKey: string, fetcher: typeof fetch = fetch): EmailSender {
  return {
    provider: "brevo",
    async send(e) {
      try {
        const res = await fetcher("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            sender: e.from.name ? { email: e.from.email, name: e.from.name } : { email: e.from.email },
            to: [{ email: e.to }],
            subject: e.subject,
            textContent: e.text,
            ...(e.replyTo ? { replyTo: { email: e.replyTo } } : {}),
            headers: outreachHeaders(e),
          }),
        });
        if (!res.ok) return { ok: false, provider: "brevo", error: await errorText(res), retryable: retryableStatus(res.status) };
        const j = (await res.json().catch(() => ({}))) as { messageId?: string };
        return { ok: true, provider: "brevo", messageId: j.messageId ?? null };
      } catch (err) {
        return { ok: false, provider: "brevo", error: (err as Error).message, retryable: true };
      }
    },
  };
}
