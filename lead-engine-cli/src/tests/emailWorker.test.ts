/** Envoi par le worker : adapter SMTP (transport simulé) et boucle de file. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import nodemailer, { type SendMailOptions, type Transporter } from "nodemailer";
import type { EmailSender } from "../../../shared/outreach/email";
import { processEmailBatch, type ClaimResponse } from "../outreach/emailWorker";
import { smtpSender, smtpSettingsFrom } from "../outreach/smtpSender";

const EMAIL = { from: { email: "loic@envoi.test", name: "Loïc" }, to: "contact@plombier.test", subject: "Votre site", text: "Bonjour", replyTo: "loic@principal.test", leadId: "abcd1234" };

describe("adapter SMTP", () => {
  it("lit la configuration (465 = TLS direct, 587 = STARTTLS)", () => {
    assert.equal(smtpSettingsFrom({}), null);
    assert.deepEqual(smtpSettingsFrom({ SMTP_HOST: "smtp.test", SMTP_PORT: "465", SMTP_USER: "u", SMTP_PASS: "p" }), { host: "smtp.test", port: 465, secure: true, user: "u", pass: "p" });
    assert.equal(smtpSettingsFrom({ SMTP_HOST: "smtp.test" })?.secure, false);
  });

  it("construit le message avec réponse, désinscription et lead", async () => {
    const transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" });
    const sent: Buffer[] = [];
    const spy = { sendMail: async (m: SendMailOptions) => { const info = await transport.sendMail(m); sent.push(info.message as Buffer); return info; } } as unknown as Transporter;
    assert.equal((await smtpSender({ host: "x", port: 587, secure: false }, spy).send(EMAIL)).ok, true);
    const msg = sent[0]!.toString();
    assert.match(msg, /List-Unsubscribe: <mailto:loic@principal\.test\?subject=STOP>/);
    assert.match(msg, /X-Lead-Id: abcd1234/i);
    assert.match(msg, /Reply-To: loic@principal\.test/);
  });

  it("une erreur 4xx est réessayable, une 5xx non", async () => {
    const failing = (responseCode: number) =>
      ({ sendMail: async () => { throw Object.assign(new Error(`SMTP ${responseCode}`), { responseCode }); } }) as unknown as Transporter;
    const temp = await smtpSender({ host: "x", port: 587, secure: false }, failing(421)).send(EMAIL);
    const perm = await smtpSender({ host: "x", port: 587, secure: false }, failing(550)).send(EMAIL);
    assert.equal(!temp.ok && temp.retryable, true);
    assert.equal(!perm.ok && perm.retryable, false);
  });
});

describe("boucle d'envoi", () => {
  it("envoie les emails réclamés et rend compte de chacun", async () => {
    const calls: { path: string; body: unknown }[] = [];
    const claim: ClaimResponse = {
      from: { email: "loic@envoi.test" },
      reply_to: null,
      emails: [
        { id: 1, lead_id: "abcd1234", provider: "smtp", to: "contact@plombier.test", subject: "Votre site", text: "Bonjour" },
        { id: 2, lead_id: "abcd1234", provider: "smtp", to: "invalide", subject: "Votre site", text: "Bonjour" },
      ],
    };
    const api = async <T,>(path: string, body?: unknown): Promise<T> => {
      calls.push({ path, body });
      return (path.endsWith("/claim") ? claim : { ok: true }) as T;
    };
    const sent: string[] = [];
    const sender: EmailSender = { provider: "smtp", send: async (e) => (sent.push(e.to), { ok: true, provider: "smtp", messageId: "<m1>" }) };
    assert.equal(await processEmailBatch(api, [sender]), 1);
    assert.deepEqual(sent, ["contact@plombier.test"]);
    assert.deepEqual(calls[0], { path: "/api/worker/emails/claim", body: { providers: ["smtp"] } });
    assert.deepEqual(calls[1], { path: "/api/worker/emails/1/result", body: { ok: true, messageId: "<m1>" } });
    assert.deepEqual(calls[2], { path: "/api/worker/emails/2/result", body: { ok: false, error: "destinataire invalide", retryable: false } });
  });
});
