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

describe("génération API — démo de site complémentaire d'un bilan", () => {
  it("écrit site_demo.html quand prompt_site_demo.md existe, sans toucher au bilan déjà écrit", async () => {
    const { generateOne } = await import("../generateQueue");
    const dir = mkdtempSync(join(tmpdir(), "lq-site-"));
    writeFileSync(join(dir, "meta.json"), JSON.stringify({ company_name: "Plomberie Martin", logoUrl: null }));
    writeFileSync(join(dir, "demo.html"), "<!DOCTYPE html><html><body>BILAN</body></html>");
    writeFileSync(join(dir, "battlecard.json"), "{}");
    writeFileSync(join(dir, "prompt_site_demo.md"), "# Consigne\nDémo de site d'angle référencement local.");
    const prompts: string[] = [];
    const router = {
      generate: async (req: { prompt: string }) => {
        prompts.push(req.prompt);
        return { text: `<!DOCTYPE html><html><head></head><body>${"x".repeat(2500)}</body></html>` };
      },
    } as unknown as import("../llm/modelRouter").ModelRouter;
    const cfg = { REMOTE_APP_URL: "https://app.test" } as unknown as import("../config").Config;
    await generateOne("l1", cfg, router, "# Guide", async () => {}, dir);
    assert.ok(existsSync(join(dir, "site_demo.html")), "site_demo.html écrit");
    assert.match(readFileSync(join(dir, "site_demo.html"), "utf-8"), /<html/);
    assert.equal(readFileSync(join(dir, "demo.html"), "utf-8"), "<!DOCTYPE html><html><body>BILAN</body></html>");
    assert.equal(prompts.length, 1);
    assert.match(prompts[0]!, /angle référencement local/);
  });

  it("sans prompt_site_demo.md : aucune démo de site demandée", async () => {
    const { generateOne } = await import("../generateQueue");
    const dir = mkdtempSync(join(tmpdir(), "lq-nosite-"));
    writeFileSync(join(dir, "meta.json"), JSON.stringify({}));
    writeFileSync(join(dir, "demo.html"), "<html></html>");
    writeFileSync(join(dir, "battlecard.json"), "{}");
    const router = { generate: async () => assert.fail("aucun appel attendu") } as unknown as import("../llm/modelRouter").ModelRouter;
    await generateOne("l2", { REMOTE_APP_URL: "https://app.test" } as unknown as import("../config").Config, router, null, async () => {}, dir);
    assert.ok(!existsSync(join(dir, "site_demo.html")));
  });
});
