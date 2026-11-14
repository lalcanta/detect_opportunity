import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EMAIL_TEMPLATES, buildTemplateVars, extractDomain, renderTemplate, templatesForOpportunity } from "../templates/emailTemplates";
import { OPPORTUNITY_TYPES } from "../types";

describe("RÈGLES MÉTIER : Templating Email (contrôle humain, aucun envoi automatique)", () => {
  describe("Règle 13 : Moteur de fusion {{variable|repli}}", () => {
    it("remplace les variables connues", () => {
      assert.equal(renderTemplate("Hello {{name}} !", { name: "Loïc" }), "Hello Loïc !");
    });
    it("utilise la valeur de repli si la variable est vide ou inconnue", () => {
      assert.equal(renderTemplate("{{x|défaut}}-{{y|autre}}", { x: "" }), "défaut-autre");
    });
    it("remplace une variable inconnue sans repli par une chaîne vide", () => {
      assert.equal(renderTemplate("a{{inconnue}}b", {}), "ab");
    });
  });

  describe("Règle 14 : Construction des variables depuis le lead", () => {
    const vars = buildTemplateVars({
      company_name: "Digidop",
      website_url: "https://www.digidop.fr/fr/",
      demo_url: "https://app/demos/x",
      audit: {
        key_people: ["Florian Buerger"],
        stack: ["Webflow", "GSAP"],
        awards: ["Awwwards SOTD"],
        trackers_found: ["GA4", "Hotjar"],
        report_url: "https://r2/digidop.html",
      },
    });

    it("extrait le domaine nu (sans protocole, www ni chemin)", () => {
      assert.equal(extractDomain("https://www.digidop.fr/fr/?a=1"), "digidop.fr");
      assert.equal(vars.domain, "digidop.fr");
    });
    it("personnalise la salutation avec le prénom du contact clé", () => {
      assert.equal(vars.greeting, "Hello Florian & l'équipe Digidop,");
    });
    it("replie sur 'l'équipe' sans contact identifié", () => {
      const v = buildTemplateVars({ company_name: "Acme", demo_url: "u" });
      assert.equal(v.greeting, "Hello l'équipe Acme,");
    });
    it("formate les traceurs en liste à tirets et privilégie report_url", () => {
      assert.equal(vars.trackers_list, "- GA4\n- Hotjar");
      assert.equal(vars.report_url, "https://r2/digidop.html");
    });
    it("replie report_url sur l'URL de démo si aucun rapport", () => {
      const v = buildTemplateVars({ company_name: "Acme", demo_url: "https://app/demos/y" });
      assert.equal(v.report_url, "https://app/demos/y");
    });
  });

  describe("Règle 15 : Catalogue de modèles & ligne éditoriale asynchrone", () => {
    it("chaque modèle a un id unique, un objet et un corps", () => {
      const ids = EMAIL_TEMPLATES.map((t) => t.id);
      assert.equal(new Set(ids).size, ids.length);
      for (const t of EMAIL_TEMPLATES) assert.ok(t.subject && t.body);
    });
    it("chaque modèle cible une opportunité existante ou '*'", () => {
      const known = new Set<string>(OPPORTUNITY_TYPES.map((o) => o.id));
      for (const t of EMAIL_TEMPLATES) for (const o of t.opportunities) assert.ok(o === "*" || known.has(o), `${t.id} -> ${o}`);
    });
    it("propose les modèles spécifiques avant les génériques", () => {
      const list = templatesForOpportunity("audit_qa_trackers");
      assert.equal(list[0].id, "qa_trackers_first");
      assert.ok(list.some((t) => t.opportunities.includes("*")));
    });
    it("les modèles 'Traceurs RGPD' ne proposent jamais d'appel, de visio ni de Calendly", () => {
      const forbidden = /appel téléphonique|visio|calendly|15 minutes|de vive voix|rendez-vous/i;
      for (const t of templatesForOpportunity("audit_qa_trackers")) {
        assert.ok(!forbidden.test(t.subject + t.body), `${t.id} contient une formule interdite`);
      }
    });
    it("le rendu du premier contact QA ne laisse aucune variable non remplacée", () => {
      const tpl = EMAIL_TEMPLATES.find((t) => t.id === "qa_trackers_first")!;
      const vars = buildTemplateVars({ company_name: "Acme", website_url: "https://acme.fr", demo_url: "u" });
      const out = renderTemplate(tpl.subject + tpl.body, vars);
      assert.ok(!/\{\{/.test(out));
      assert.ok(out.includes("acme.fr"));
    });
  });
  describe("Gabarit QA : liste de traceurs vide", () => {
    const tpl = EMAIL_TEMPLATES.find((t) => t.id === "qa_trackers_first")!;
    const render = (audit: Record<string, unknown>) =>
      renderTemplate(tpl.body, buildTemplateVars({ company_name: "Acme", website_url: "https://acme.fr", demo_url: "u", audit }));
    it("sans traceur : l'introduction « certains scripts s'exécutent » disparaît avec la liste", () => {
      const out = render({ trackers_found: [], weaknesses: [] });
      assert.doesNotMatch(out, /certains scripts|cascade réseau|\n- /);
      assert.ok(!/\{\{/.test(out));
    });
    it("faiblesses sans traceur : ni « scripts » ni les faiblesses", () => {
      const out = render({ trackers_found: [], weaknesses: ["Copyright 2018"] });
      assert.doesNotMatch(out, /scripts|Copyright 2018|\n- /);
    });
    it("avec des traceurs : introduction et liste sont présentes", () => {
      const out = render({ trackers_found: ["GA4", "Hotjar"] });
      assert.match(out, /certains scripts s'exécutent immédiatement :\n- GA4\n- Hotjar/);
    });
  });
  describe("Audit perf : objet", () => {
    it("l'objet est neutre : aucune mention du chargement", () => {
      const tpl = EMAIL_TEMPLATES.find((t) => t.id === "perf_audit_first")!;
      const subject = renderTemplate(tpl.subject, buildTemplateVars({ company_name: "Acme", website_url: "https://acme.fr", demo_url: "u" }));
      assert.equal(subject, "Quelques points relevés sur acme.fr");
    });
  });
  describe("Audit perf : liste de faiblesses vide", () => {
    const tpl = EMAIL_TEMPLATES.find((t) => t.id === "perf_audit_first")!;
    const render = (audit: Record<string, unknown>) =>
      renderTemplate(tpl.body, buildTemplateVars({ company_name: "Acme", website_url: "https://acme.fr", demo_url: "u", audit }));
    it("sans faiblesse mesurée : pas de « quelques points » suivi de rien", () => {
      const out = render({ weaknesses: [] });
      assert.doesNotMatch(out, /relevé quelques points|\n- /);
      assert.ok(!/\{\{/.test(out));
    });
    it("avec des faiblesses : la liste est citée", () => {
      const out = render({ weaknesses: ["Copyright 2018"] });
      assert.match(out, /relevé quelques points/);
      assert.match(out, /- Copyright 2018/);
    });
    it("intro neutre : ne présente pas les points comme une cause de lenteur ni promet d'impact", () => {
      const out = render({ weaknesses: ["Copyright 2018"] });
      assert.match(out, /j'ai relevé quelques points sur votre site :/);
      assert.doesNotMatch(out, /pénalis|chargement|conversion/i);
    });
  });
});
