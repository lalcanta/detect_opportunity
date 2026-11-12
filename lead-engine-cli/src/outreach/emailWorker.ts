/**
 * Boucle d'envoi du worker : réclame au dashboard les emails en file pour ses adapters (SMTP), les envoie et rend
 * compte. Tourne à côté des scans, pour qu'un long scan ne retarde pas un email.
 */
import { validateOutgoingEmail, type EmailAddress, type EmailProviderId, type EmailSender } from "../../../shared/outreach/email";
import { log } from "../utils/helpers";

export interface ClaimedEmail {
  id: number;
  lead_id: string;
  provider: EmailProviderId;
  to: string;
  subject: string;
  text: string;
}

export interface ClaimResponse {
  from: EmailAddress | null;
  reply_to: string | null;
  emails: ClaimedEmail[];
}

export type WorkerApi = <T>(path: string, body?: unknown) => Promise<T>;

/** Un passage : renvoie le nombre d'emails partis. */
export async function processEmailBatch(api: WorkerApi, senders: EmailSender[]): Promise<number> {
  if (senders.length === 0) return 0;
  const byProvider = new Map(senders.map((s) => [s.provider, s]));
  const claim = await api<ClaimResponse>("/api/worker/emails/claim", { providers: [...byProvider.keys()] });
  let sent = 0;
  for (const e of claim.emails ?? []) {
    const sender = byProvider.get(e.provider);
    const from = claim.from;
    const email = { from: from ?? { email: "" }, to: e.to, subject: e.subject, text: e.text, replyTo: claim.reply_to ?? undefined, leadId: e.lead_id };
    const errors = sender ? validateOutgoingEmail(email) : [`adapter ${e.provider} absent du worker`];
    const result = errors.length
      ? { ok: false as const, error: errors.join(", "), retryable: false }
      : await sender!.send(email);
    if (result.ok) {
      sent++;
      log("email", `✉️ Email #${e.id} parti à ${e.to} (${e.provider})`);
    } else {
      log("email", `⚠️ Email #${e.id} non parti : ${result.error}`);
    }
    await api(`/api/worker/emails/${e.id}/result`, result.ok ? { ok: true, messageId: result.messageId } : { ok: false, error: result.error, retryable: result.retryable }).catch(
      (err: Error) => log("email", `⚠️ Compte rendu de l'email #${e.id} impossible : ${err.message}`),
    );
  }
  return sent;
}

/** Boucle infinie, indépendante de celle des scans. */
export async function runEmailLoop(api: WorkerApi, senders: EmailSender[], intervalMs = 20_000): Promise<never> {
  for (;;) {
    try {
      await processEmailBatch(api, senders);
    } catch (err) {
      log("email", `⚠️ Lecture de la file d'envoi impossible : ${(err as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
