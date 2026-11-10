import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getOpportunityOrDefault } from "../../../shared/opportunities";
import { analyzeContactFormsInHtml, detectCaptcha, findContactPageLinks } from "../inspector/modules/contactFormModule";
import { buildLeadContacts, qualifyAfterInspection } from "../opportunities/qualify";
import { demoFocusInstruction } from "../generator/demoGenerator";
import { buildQueueBattlecard } from "../syncQueue";

const PAGE = "https://agence.test/contact";

describe("contact_form — détection d'un formulaire de contact", () => {
  it("retient un formulaire avec message et email, et relève captcha et consentement", () => {
    const html = `<script src="https://www.google.com/recaptcha/api.js"></script>
      <form action="/envoyer" class="wpcf7-form">
        <input type="text" name="your-name"><input type="email" name="your-email">
        <textarea name="your-message"></textarea>
        <input type="checkbox" name="rgpd"> J'accepte la politique de confidentialité
        <input type="hidden" name="_wpnonce"><input type="submit" value="Envoyer">
      </form>`;
    const form = analyzeContactFormsInHtml(html, PAGE);
    assert.ok(form);
    assert.equal(form.url, PAGE);
    assert.deepEqual(form.fields, ["your-name", "your-email", "your-message", "rgpd"]);
    assert.equal(form.captcha, "reCAPTCHA");
    assert.equal(form.hasConsentCheckbox, true);
  });

  it("écarte recherche, newsletter et connexion", () => {
    assert.equal(analyzeContactFormsInHtml(`<form role="search"><input type="email" name="email"><textarea name="message"></textarea></form>`, PAGE), null);
    assert.equal(analyzeContactFormsInHtml(`<form class="newsletter"><input type="email" name="email"></form>`, PAGE), null);
    assert.equal(
      analyzeContactFormsInHtml(`<form><input type="email" name="email"><input type="password" name="pwd"><textarea name="message"></textarea></form>`, PAGE),
      null,
    );
    assert.equal(analyzeContactFormsInHtml(`<form><input type="email" name="email"></form>`, PAGE), null, "sans zone de message");
  });

  it("reconnaît un formulaire tiers embarqué", () => {
    const form = analyzeContactFormsInHtml(`<iframe src="https://form.typeform.com/to/abc"></iframe>`, PAGE);
    assert.equal(form?.provider, "Typeform");
  });

  it("détecte les captchas courants", () => {
    assert.equal(detectCaptcha(`<div class="cf-turnstile"></div>`), "Cloudflare Turnstile");
    assert.equal(detectCaptcha(`<script src="https://js.hcaptcha.com/1/api.js"></script>`), "hCaptcha");
    assert.equal(detectCaptcha(`<p>rien</p>`), null);
  });

  it("ne suit que les liens internes vers une page de contact ou de devis", () => {
    const links = findContactPageLinks(
      [
        { href: "https://www.agence.test/nous-contacter", text: "Contact" },
        { href: "/devis#form", text: "Demander un devis" },
        { href: "https://autre-site.fr/contact", text: "Contact" },
        { href: "mailto:hello@agence.test", text: "Écrivez-nous" },
        { href: "/a-propos", text: "À propos" },
      ],
      "https://agence.test/",
    );
    assert.deepEqual(links, ["https://www.agence.test/nous-contacter", "https://agence.test/devis"]);
  });
});

describe("qualification après inspection et contacts", () => {
  const qa = getOpportunityOrDefault("audit_qa_trackers");
  const form = { url: PAGE, fields: ["email", "message"], captcha: null, hasConsentCheckbox: false, provider: null };

  it("audit QA sans téléphone : qualifié par le formulaire, qui devient le contact principal", () => {
    const lead = { phone: null, website: "https://agence.test" };
    const inspection = { emails: [], contactForm: form };
    const q = qualifyAfterInspection(qa, lead, inspection);
    assert.equal(q.qualified, true);
    assert.equal(q.primaryChannel, "contact_form");
    const contacts = buildLeadContacts(lead, inspection, q.primaryChannel);
    assert.equal(contacts.length, 1);
    assert.equal(contacts[0]?.kind, "contact_form");
    assert.equal(contacts[0]?.is_primary, true);
  });

  it("audit QA sans email ni formulaire : rejeté", () => {
    const q = qualifyAfterInspection(qa, { phone: "0102030405", website: "https://agence.test" }, { emails: [], contactForm: null });
    assert.equal(q.qualified, false);
  });

  it("donne plus de confiance à un email générique qu'à une adresse nominative", () => {
    const contacts = buildLeadContacts({ phone: "0102030405" }, { emails: ["contact@agence.test", "jean.dupont@agence.test"], contactForm: null }, "email");
    const emails = contacts.filter((c) => c.kind === "email");
    assert.ok((emails[0]?.confidence ?? 0) > (emails[1]?.confidence ?? 0));
    assert.equal(emails[0]?.is_primary, true);
    assert.equal(contacts.find((c) => c.kind === "phone")?.is_primary, undefined);
  });
});

describe("angle de la démo full_auto", () => {
  it("ajoute une consigne pour les avis, le SEO et les Ads, rien pour une vitrine", () => {
    assert.match(demoFocusInstruction("reviews", "Foix"), /AVIS GOOGLE/);
    assert.match(demoFocusInstruction("seo_local", "Foix"), /Foix/);
    assert.equal(demoFocusInstruction("showcase", "Foix"), "");
  });
});

describe("syncQueue — message selon le canal principal", () => {
  it("attend le message écrit d'un lead SEO joignable seulement par email", () => {
    const meta = { id: "s1", company_name: "Garage Test", opportunity_type: "seo_local", primary_channel: "email" };
    assert.ok("waiting" in buildQueueBattlecard(meta, { callScript: "Bonjour" }, null, "https://app.test"));
    const done = buildQueueBattlecard(meta, { coldEmail: { subject: "Objet", body: "Corps" } }, null, "https://app.test");
    assert.ok(!("waiting" in done));
    assert.equal(done.battlecard.callScript, "", "pas de texte QA par défaut hors audit QA");
    assert.deepEqual(done.battlecard.ourAdvantages, []);
  });

  it("garde le script d'appel pour le même lead joignable par téléphone", () => {
    const meta = { id: "s2", company_name: "Garage Test", opportunity_type: "seo_local", primary_channel: "phone" };
    const res = buildQueueBattlecard(meta, { callScript: "Bonjour" }, null, "https://app.test");
    assert.ok(!("waiting" in res));
  });
});
