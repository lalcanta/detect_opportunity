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
  CHANNEL_IDS,
  DEFAULT_DIRECT_DOMAINS_OPPORTUNITY_ID,
  DEFAULT_OPPORTUNITY_ID,
  OPPORTUNITIES,
  PITCH_GENERATOR_IDS,
  PROOF_GENERATOR_IDS,
  SCAN_MODULE_IDS,
  findOpportunity,
  scanModulesFor,
} from "./index";

/** Générateur de preuve attendu pour chaque type de preuve. */
const PROOF_GENERATOR_BY_KIND = { demo_web: "llm_demo", audit_report: "tracker_report" } as const;

/** Forme de message attendue pour chaque générateur de message. */
const PITCH_KIND_BY_GENERATOR = { llm_phone_battlecard: "phone_battlecard", tracker_cold_email: "cold_email" } as const;

/** Forme de message attendue selon le canal principal. */
const PITCH_KIND_BY_PRIMARY_CHANNEL = { phone: "phone_battlecard", email: "cold_email" } as const;

/**
 * Incohérences connues de la phase 0, décrites telles qu'elles existent dans le code.
 * À vider en phase 1 ; ne pas en ajouter.
 */
const KNOWN_PHASE0_CHANNEL_PITCH_MISMATCHES = new Set(["custom"]);

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

      it("a des générateurs existants et compatibles avec la preuve et le message", () => {
        assert.ok((PROOF_GENERATOR_IDS as readonly string[]).includes(def.proof.generator));
        assert.ok((PITCH_GENERATOR_IDS as readonly string[]).includes(def.pitch.generator));
        assert.equal(def.proof.generator, PROOF_GENERATOR_BY_KIND[def.proof.kind]);
        assert.equal(def.pitch.kind, PITCH_KIND_BY_GENERATOR[def.pitch.generator]);
        assert.ok(def.proof.interestCta.trim());
        // L'email déterministe cite le rapport traceurs : il n'a de sens qu'avec cette preuve.
        if (def.pitch.generator === "tracker_cold_email") assert.equal(def.proof.generator, "tracker_report");
      });

      it("a un message adapté à son canal principal", () => {
        const expected = PITCH_KIND_BY_PRIMARY_CHANNEL[def.channels[0]!];
        if (KNOWN_PHASE0_CHANNEL_PITCH_MISMATCHES.has(def.id)) {
          assert.notEqual(def.pitch.kind, expected, `${def.id} est cohérent : le retirer des exceptions`);
          return;
        }
        assert.equal(def.pitch.kind, expected);
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
    assert.deepEqual(JSON.parse(match[1]!), ALL_OPPORTUNITY_IDS);
  });
});
