import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getOpportunityOrDefault } from "../../../shared/opportunities";
import { analyzeContactFormsInHtml, detectCaptcha, findContactPageLinks } from "../inspector/modules/contactFormModule";
import { buildLeadContacts, buildUnqualifiedPayload, qualifyAfterInspection } from "../opportunities/qualify";
import { demoFocusInstruction } from "../generator/demoGenerator";
import { pickSiteImages } from "../inspector/modules/brandingVisualModule";
import { fetchPlacesReviews, mapPlacesReviews } from "../collector/placesReviews";
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

describe("lead non qualifié", () => {
  it("garde les mesures et les raisons lisibles, sans démo ni battlecard", () => {
    const qa = getOpportunityOrDefault("audit_qa_trackers");
    const lead = { name: "Agence X", activity: "Agence web", city: "Foix", phone: "0102030405", website: "https://x.fr", rating: 4.5, reviewsCount: 3, recentReviews: [], mapsUrl: "https://maps/x", placeId: null };
    const inspection = { url: "https://x.fr", loadTimeMs: 500, isResponsive: true, dominantColors: [], logoUrl: null, screenshot: null, emails: [], contactForm: null, siren: "123456789" };
    const result = qualifyAfterInspection(qa, lead, inspection);
    const p = buildUnqualifiedPayload({ id: "abc", lead, inspection, opportunityType: "audit_qa_trackers", result });
    assert.equal(p.status, "unqualified");
    assert.equal(p.demo_html, undefined);
    assert.deepEqual(p.audit_data.unqualified_reasons, ["aucun contact parmi : email, formulaire de contact"]);
    assert.equal(p.audit_data.siren, "123456789");
    assert.equal(p.contacts?.[0]?.kind, "phone");
  });
});

describe("photos du site pour la démo", () => {
  it("garde les vraies photos, les plus grandes d'abord, sans logo, icône ni doublon", () => {
    const out = pickSiteImages(
      [
        { url: "https://x.fr/logo.png", w: 400, h: 200 },
        { url: "https://x.fr/uploads/chantier.jpg", w: 800, h: 500 },
        { url: "https://x.fr/uploads/atelier.jpg", w: 1200, h: 700 },
        { url: "https://x.fr/uploads/atelier.jpg#zoom", w: 1200, h: 700 },
        { url: "https://x.fr/icons/phone.png", w: 600, h: 600 },
        { url: "https://x.fr/uploads/mini.jpg", w: 120, h: 80 },
        { url: "https://x.fr/uploads/bandeau.jpg", w: 1900, h: 120 },
        { url: "https://x.fr/uploads/equipe.jpg", w: 500, h: 400, alt: "Logo partenaire" },
        { url: "data:image/png;base64,AAA", w: 800, h: 600 },
      ],
      "https://x.fr/logo.png",
    );
    assert.deepEqual(out, ["https://x.fr/uploads/atelier.jpg", "https://x.fr/uploads/chantier.jpg"]);
  });
});

describe("avis via l'API Places", () => {
  const sample = {
    places: [{ reviews: [
      { rating: 4, text: { text: "Bon accueil" }, relativePublishTimeDescription: "il y a 2 mois", authorAttribution: { displayName: "Marie" } },
      { rating: 5, originalText: { text: "Excellent saucisson" }, text: { text: "Excellent saucisson (traduit)" }, authorAttribution: { displayName: "Paul" } },
      { rating: 5, text: { text: "" } },
    ] }],
  };
  it("garde les avis avec texte, texte original prioritaire, les mieux notés d'abord", () => {
    assert.deepEqual(mapPlacesReviews(sample), [
      { author: "Paul", rating: 5, text: "Excellent saucisson", relativeDate: "" },
      { author: "Marie", rating: 4, text: "Bon accueil", relativeDate: "il y a 2 mois" },
    ]);
  });
  it("ne fait aucun appel sans clé, et renvoie une liste vide en cas d'erreur", async () => {
    const saved = process.env.GOOGLE_PLACES_API_KEY;
    delete process.env.GOOGLE_PLACES_API_KEY;
    let calls = 0;
    const fake = (async () => { calls++; return new Response("{}"); }) as typeof fetch;
    assert.deepEqual(await fetchPlacesReviews("X", "Foix", fake), []);
    assert.equal(calls, 0);
    process.env.GOOGLE_PLACES_API_KEY = "test";
    const failing = (async () => new Response("quota", { status: 429 })) as typeof fetch;
    assert.deepEqual(await fetchPlacesReviews("X", "Foix", failing), []);
    const ok = (async (_u: unknown, init?: RequestInit) => {
      assert.equal((init?.headers as Record<string, string>)["X-Goog-Api-Key"], "test");
      return new Response(JSON.stringify(sample));
    }) as typeof fetch;
    assert.equal((await fetchPlacesReviews("X", "Foix", ok)).length, 2);
    if (saved === undefined) delete process.env.GOOGLE_PLACES_API_KEY; else process.env.GOOGLE_PLACES_API_KEY = saved;
  });
});

describe("directions artistiques des démos", () => {
  it("donne une direction stable par lead, compatible avec son métier", async () => {
    const { pickDesignDirection, DESIGN_DIRECTIONS, detectArtisanArchetype } = await import("../generator/designDirections");
    assert.equal(pickDesignDirection("abc", "Couvreur").id, pickDesignDirection("abc", "Couvreur").id);
    for (const id of ["a1", "b2", "c3", "d4", "e5", "f6", "g7", "h8"]) {
      const d = pickDesignDirection(id, "Serrurier");
      assert.ok(d.suits.includes("urgence"), `${d.id} doit convenir à un métier d'urgence`);
    }
    const used = new Set(["a1", "b2", "c3", "d4", "e5", "f6", "g7", "h8", "i9", "j10"].map((id) => pickDesignDirection(id, "Boulangerie").id));
    assert.ok(used.size >= 3, "plusieurs boulangeries ne reçoivent pas toutes la même direction");
    assert.equal(detectArtisanArchetype("Charcuterie").id, "gourmand");
    assert.ok(DESIGN_DIRECTIONS.length >= 6);
  });
  it("charge les deux polices de la direction", async () => {
    const { googleFontsHref, renderDesignBrief, DESIGN_DIRECTIONS } = await import("../generator/designDirections");
    const neo = DESIGN_DIRECTIONS.find((d) => d.id === "neo_brutal")!;
    assert.equal(googleFontsHref(neo), "https://fonts.googleapis.com/css2?family=Archivo+Black&family=Space+Grotesk:wght@400;500;600;700;800&display=swap");
    assert.match(renderDesignBrief(neo), /Néo-brutal coloré[\s\S]*prefers-reduced-motion/);
  });
});
