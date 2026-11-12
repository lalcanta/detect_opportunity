/**
 * Cohérence du registre des opportunités (docs/PLAN_REFONTE_LEADS.md §3.1).
 * Les générateurs et les vérifications de site sont garantis à la compilation par les
 * `Record<…Id, …>` de lead-engine-cli ; ce test couvre le reste du contrat.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  ALL_OPPORTUNITY_IDS,
  CODE_OPPORTUNITIES,
  CHANNEL_IDS,
  DEFAULT_DIRECT_DOMAINS_OPPORTUNITY_ID,
  DEFAULT_OPPORTUNITY_ID,
  OPPORTUNITIES,
  PITCH_GENERATOR_IDS,
  PITCH_KIND_BY_GENERATOR,
  PROOF_GENERATOR_IDS,
  SCAN_MODULE_IDS,
  findOpportunity,
  scanModulesFor,
} from "./index";

/** Générateur de preuve attendu pour chaque type de preuve. */
const PROOF_GENERATOR_BY_KIND = { demo_web: "llm_demo", audit_report: "tracker_report" } as const;

describe("Registre des opportunités", () => {
  it("a des identifiants uniques en snake_case", () => {
    assert.equal(new Set(ALL_OPPORTUNITY_IDS).size, ALL_OPPORTUNITY_IDS.length);
    for (const id of ALL_OPPORTUNITY_IDS) assert.match(id, /^[a-z][a-z0-9_]*$/, id);
  });

  it("a des valeurs par défaut qui existent et sont actives", () => {
    for (const id of [DEFAULT_OPPORTUNITY_ID, DEFAULT_DIRECT_DOMAINS_OPPORTUNITY_ID]) {
      assert.equal(findOpportunity(id)?.status, "active", id);
    }
  });

  for (const def of OPPORTUNITIES) {
    describe(def.id, () => {
      it("a un libellé, un badge, une icône et un angle commercial", () => {
        assert.ok(def.label.trim());
        assert.ok(def.badge.text.trim());
        assert.ok(def.icon.trim());
        assert.ok(def.commercial.pitchFocus.trim());
      });

      it("n'utilise que des vérifications de site existantes, sans doublon", () => {
        assert.ok(def.scanModules.length > 0);
        assert.equal(new Set(def.scanModules).size, def.scanModules.length);
        for (const m of def.scanModules) assert.ok((SCAN_MODULE_IDS as readonly string[]).includes(m), m);
      });

      it("déclare au moins un canal connu, sans doublon", () => {
        assert.ok(def.channels.length > 0);
        assert.equal(new Set(def.channels).size, def.channels.length);
        for (const c of def.channels) assert.ok((CHANNEL_IDS as readonly string[]).includes(c), c);
      });

      it("a un générateur de preuve existant et compatible", () => {
        assert.ok((PROOF_GENERATOR_IDS as readonly string[]).includes(def.proof.generator));
        assert.equal(def.proof.generator, PROOF_GENERATOR_BY_KIND[def.proof.kind]);
        assert.ok(def.proof.interestCta.trim());
      });

      it("a un générateur de message pour chacun de ses canaux, et seulement pour eux", () => {
        assert.deepEqual(Object.keys(def.pitch).sort(), [...def.channels].sort());
        for (const [channel, generator] of Object.entries(def.pitch)) {
          assert.ok((PITCH_GENERATOR_IDS as readonly string[]).includes(generator!), generator);
          // Le téléphone appelle un script d'appel ; l'email et le formulaire, un message écrit.
          const expected = channel === "phone" ? "phone_battlecard" : "cold_email";
          assert.equal(PITCH_KIND_BY_GENERATOR[generator!], expected, `${channel} → ${generator}`);
          // L'email déterministe cite le rapport traceurs : il n'a de sens qu'avec cette preuve.
          if (generator === "tracker_cold_email") assert.equal(def.proof.generator, "tracker_report");
        }
      });

      it("exige au moins un contact, choisi parmi ses canaux", () => {
        const { allOf = [], anyOf = [] } = def.requirements.contacts;
        assert.ok(allOf.length + anyOf.length > 0, "aucun contact exigé");
        for (const c of [...allOf, ...anyOf]) assert.ok(def.channels.includes(c), `${c} exigé mais absent des canaux`);
      });

      it("lance les vérifications de site qui trouvent ses canaux écrits", () => {
        if (def.channels.includes("email")) assert.ok(def.scanModules.includes("contacts_legal"));
        if (def.channels.includes("contact_form")) assert.ok(def.scanModules.includes("contact_form"));
      });

      it("n'exige pas de contact écrit sans site", () => {
        if (def.requirements.website !== "forbidden") return;
        const { allOf = [], anyOf = [] } = def.requirements.contacts;
        assert.ok(allOf.every((c) => c === "phone"));
        assert.ok(anyOf.length === 0 || anyOf.includes("phone"));
      });
    });
  }

  it("renvoie toutes les vérifications pour une opportunité absente ou inconnue", () => {
    assert.deepEqual([...scanModulesFor(null)], [...SCAN_MODULE_IDS]);
    assert.deepEqual([...scanModulesFor("inconnue")], [...SCAN_MODULE_IDS]);
  });

  it("est repris tel quel dans la valeur par défaut de users.allowed_opportunities (schema.sql)", () => {
    const schema = readFileSync(new URL("../../lead-dashboard-web/schema.sql", import.meta.url), "utf8");
    const match = schema.match(/allowed_opportunities\s+TEXT NOT NULL DEFAULT '([^']+)'/);
    assert.ok(match, "colonne allowed_opportunities introuvable dans schema.sql");
    assert.deepEqual(JSON.parse(match[1]!), CODE_OPPORTUNITIES.map((o) => o.id));
  });
});
