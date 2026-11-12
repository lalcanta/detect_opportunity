/** Adapter SMTP du port d'envoi (shared/outreach/email.ts) : la boîte du domaine d'envoi, depuis le worker. */
import nodemailer, { type Transporter } from "nodemailer";
import { formatAddress, outreachHeaders, type EmailSender } from "../../../shared/outreach/email";

export interface SmtpSettings {
  host: string;
  port: number;
  /** TLS dès la connexion (port 465) ; sinon STARTTLS. */
  secure: boolean;
  user?: string;
  pass?: string;
}

/** Réglages SMTP lus dans l'environnement du worker, ou `null` si l'envoi SMTP n'est pas configuré. */
export function smtpSettingsFrom(env: Record<string, string | undefined>): SmtpSettings | null {
  const host = env.SMTP_HOST?.trim();
  if (!host) return null;
  const port = Number.parseInt(env.SMTP_PORT ?? "", 10) || 587;
  const secure = env.SMTP_SECURE ? env.SMTP_SECURE === "true" : port === 465;
  return { host, port, secure, user: env.SMTP_USER || undefined, pass: env.SMTP_PASS || undefined };
}

/** Codes SMTP 4xx et erreurs réseau : un nouvel essai a du sens. */
function isRetryable(err: unknown): boolean {
  const e = err as { responseCode?: number; code?: string };
  if (typeof e.responseCode === "number") return e.responseCode >= 400 && e.responseCode < 500;
  return ["ECONNECTION", "ETIMEDOUT", "ESOCKET", "ECONNREFUSED", "EDNS"].includes(e.code ?? "");
}

export function smtpSender(settings: SmtpSettings, transporter?: Transporter): EmailSender {
  const transport =
    transporter ??
    nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      requireTLS: !settings.secure,
      auth: settings.user ? { user: settings.user, pass: settings.pass ?? "" } : undefined,
      connectionTimeout: 15_000,
      socketTimeout: 30_000,
    });
  return {
    provider: "smtp",
    async send(e) {
      try {
        const info = await transport.sendMail({
          from: formatAddress(e.from),
          to: e.to,
          subject: e.subject,
          text: e.text,
          replyTo: e.replyTo,
          headers: outreachHeaders(e),
        });
        return { ok: true, provider: "smtp", messageId: info.messageId ?? null };
      } catch (err) {
        return { ok: false, provider: "smtp", error: (err as Error).message.slice(0, 300), retryable: isRetryable(err) };
      }
    },
  };
}
