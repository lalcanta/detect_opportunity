/** Port d'envoi d'emails : validation, mention d'opposition, adapters HTTP. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { brevoSender, hasOptOut, parseAddress, resendSender, validateOutgoingEmail, withOptOut, type OutgoingEmail } from "./email";

const EMAIL: OutgoingEmail = {
  from: { email: "loic@envoi.test", name: "Loïc" },
  to: "contact@plombier.test",
  subject: "Votre site",
  text: "Bonjour,\nVoici la démo.",
  replyTo: "loic@principal.test",
  leadId: "abcd1234",
};

function capture(status = 200, json: unknown = { id: "msg_1" }) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { calls, fetcher };
}

describe("email sortant", () => {
  it("valide destinataire, expéditeur, objet et variables", () => {
    assert.deepEqual(validateOutgoingEmail(EMAIL), []);
    const bad = validateOutgoingEmail({ ...EMAIL, to: "pas-une-adresse", subject: "Ligne\nInjectée", text: "Bonjour {{prenom}}" });
    assert.ok(bad.includes("destinataire invalide"));
    assert.ok(bad.includes("objet sur plusieurs lignes"));
    assert.ok(bad.includes("variables du modèle non remplacées"));
    assert.ok(validateOutgoingEmail({ ...EMAIL, from: { email: "" } }).includes("expéditeur non configuré ou invalide"));
  });

  it("ajoute la mention d'opposition une seule fois", () => {
    const once = withOptOut(EMAIL.text);
    assert.ok(hasOptOut(once));
    assert.equal(withOptOut(once), once);
    assert.equal(withOptOut("Répondez STOP pour ne plus être contacté."), "Répondez STOP pour ne plus être contacté.");
  });

  it("lit « Nom <adresse> »", () => {
    assert.deepEqual(parseAddress("Loïc Alcantara <loic@envoi.test>"), { email: "loic@envoi.test", name: "Loïc Alcantara" });
    assert.deepEqual(parseAddress("loic@envoi.test"), { email: "loic@envoi.test" });
    assert.equal(parseAddress("n'importe quoi"), null);
  });

  it("Resend : requête, en-têtes et identifiant du message", async () => {
    const { calls, fetcher } = capture(200, { id: "re_123" });
    const r = await resendSender("key", fetcher).send(EMAIL);
    assert.deepEqual(r, { ok: true, provider: "resend", messageId: "re_123" });
    const body = JSON.parse(String(calls[0]!.init.body));
    assert.equal(calls[0]!.url, "https://api.resend.com/emails");
    assert.equal(body.from, '"Loïc" <loic@envoi.test>');
    assert.equal(body.reply_to, "loic@principal.test");
    assert.equal(body.headers["List-Unsubscribe"], "<mailto:loic@principal.test?subject=STOP>");
    assert.equal(body.headers["X-Lead-Id"], "abcd1234");
  });

  it("Brevo : un quota dépassé est réessayable, une clé refusée non", async () => {
    const quota = await brevoSender("k", capture(429, { message: "Too many" }).fetcher).send(EMAIL);
    assert.deepEqual(quota, { ok: false, provider: "brevo", error: "HTTP 429 : Too many", retryable: true });
    const denied = await brevoSender("k", capture(401, { message: "Key not found" }).fetcher).send(EMAIL);
    assert.equal(denied.ok, false);
    assert.equal(!denied.ok && denied.retryable, false);
    const { calls, fetcher } = capture(201, { messageId: "<b@x>" });
    assert.deepEqual(await brevoSender("k", fetcher).send(EMAIL), { ok: true, provider: "brevo", messageId: "<b@x>" });
    assert.deepEqual(JSON.parse(String(calls[0]!.init.body)).to, [{ email: "contact@plombier.test" }]);
  });
});
