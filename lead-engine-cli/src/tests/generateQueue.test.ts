import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CRAFT_GUIDE_PATH, buildApiBattlecardPrompt, buildApiDemoPrompt } from "../generateQueue";
import { queueUsageFor } from "../syncQueue";
import { effectiveModeOf, parseLeadIds } from "../worker";

describe("mode réellement exécuté", () => {
  it("signale la préparation forcée par le coupe-circuit", () => {
    assert.equal(effectiveModeOf({ execution_mode: "full_auto" }, false), "full_auto");
    assert.equal(effectiveModeOf({ execution_mode: "full_auto" }, true), "prep_only");
    assert.equal(effectiveModeOf({ execution_mode: "prep_only" }, false), "prep_only");
    assert.equal(effectiveModeOf({ execution_mode: "full_auto", job_type: "generate" }, true), "api_generation");
  });

  it("n'accepte que des identifiants de lead propres", () => {
    assert.deepEqual(parseLeadIds('["abc123","../etc","x y",4,"ok-1"]'), ["abc123", "ok-1"]);
    assert.deepEqual(parseLeadIds("pas du json"), []);
    assert.deepEqual(parseLeadIds(null), []);
  });
});

describe("génération API de la file", () => {
  it("reprend la consigne de l'agent sans écriture de fichier, avec le guide sans frontmatter", () => {
    const p = buildApiDemoPrompt("# Consigne\nFais une démo.", "---\nname: x\n---\n# Guide\nRègle 1");
    assert.match(p, /UNIQUEMENT avec le code HTML complet/);
    assert.match(p, /Fais une démo\./);
    assert.match(p, /# Guide\nRègle 1/);
    assert.doesNotMatch(p, /name: x/);
    assert.match(buildApiBattlecardPrompt("Schéma"), /UNIQUEMENT avec le JSON/);
  });

  it("remonte les consommations API enregistrées, sinon la provenance agent", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lq-"));
    const agent = await queueUsageFor(dir, { opportunity_type: "website" });
    assert.match(agent[0]!.model, /^agent:/);
    writeFileSync(join(dir, "generation_usage.json"), JSON.stringify([{ task: "demo", model: "gemini-3.5-flash-lite", inputTokens: 10, outputTokens: 20, thinkingTokens: 0 }]));
    const api = await queueUsageFor(dir, { opportunity_type: "website" });
    assert.equal(api[0]!.model, "gemini-3.5-flash-lite");
  });
});

describe("guide de design des démos", () => {
  it("existe là où la génération par API le lit, avec sa règle d'honnêteté", () => {
    assert.ok(existsSync(CRAFT_GUIDE_PATH), CRAFT_GUIDE_PATH);
    assert.match(readFileSync(CRAFT_GUIDE_PATH, "utf-8"), /Règle d'honnêteté/);
  });
});
