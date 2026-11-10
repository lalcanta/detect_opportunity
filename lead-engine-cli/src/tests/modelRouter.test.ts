import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ModelRouter, ZeroCostModeError } from "../llm/modelRouter";
import type { Config } from "../config";

const cfg = {
  REMOTE_APP_URL: "http://127.0.0.1:1",
  SYNC_SECRET_TOKEN: "test-token-123",
  OPENAI_BASE_URL: "https://api.openai.com/v1",
  THINKING_BUDGET_HEAVY: 0,
  CDP_URL: "http://localhost:9222",
} as Config;

const CIRCUIT_BREAKER = ["demo", "audit", "battlecard", "TASK_FAST"].map((action_type) => ({
  action_type,
  provider: "cli",
  model: "antigravity-0euro",
  thinking_budget: 0,
}));

describe("ModelRouter — coupe-circuit 0 € (audit 3.1)", () => {
  it("doit signaler le mode 0 € uniquement quand toutes les actions génératives sont en cli", () => {
    const router = new ModelRouter(cfg);
    assert.equal(router.isZeroCostMode(), false);
    router.updateSettings(CIRCUIT_BREAKER);
    assert.equal(router.isZeroCostMode(), true);
  });

  it("ne doit appeler aucune API quand une action est en provider cli", async () => {
    const router = new ModelRouter(cfg);
    router.updateSettings(CIRCUIT_BREAKER);
    await assert.rejects(router.generate({ task: "demo", prompt: "x" } as never), ZeroCostModeError);
  });

  it("ne doit pas retomber sur Gemini pour un provider inconnu", async () => {
    const router = new ModelRouter(cfg);
    router.updateSettings([{ action_type: "audit", provider: "inconnu", model: "m" }]);
    await assert.rejects(router.generate({ task: "audit", prompt: "x" } as never), /Provider IA inconnu/);
  });
});

describe("ModelRouter — repli tracé", () => {
  it("marque les consommations d'un repli avec le modèle configuré, pas un appel normal", async () => {
    const router = new ModelRouter(cfg);
    router.updateSettings([{ action_type: "demo", provider: "cloudflare", model: "@cf/inexistant" }]);
    const usage: Array<{ task: string; model: string; requestedModel?: string }> = [];
    (router as unknown as { dispatch: unknown }).dispatch = async (_c: unknown, req: { usageSink: typeof usage }) => {
      req.usageSink.push({ task: "demo", model: "gemini-3-flash-preview" });
      return { text: "ok", model: "gemini-3-flash-preview", provider: "gemini" };
    };
    await router.generate({ task: "demo", prompt: "x", usageSink: usage } as never);
    assert.equal(usage[0]?.requestedModel, "@cf/inexistant");

    const normal: typeof usage = [];
    (router as unknown as { dispatch: unknown }).dispatch = async (_c: unknown, req: { usageSink: typeof usage }) => {
      req.usageSink.push({ task: "demo", model: "@cf/inexistant" });
      return { text: "ok", model: "@cf/inexistant", provider: "cloudflare" };
    };
    await router.generate({ task: "demo", prompt: "x", usageSink: normal } as never);
    assert.equal(normal[0]?.requestedModel, undefined);
  });
});

describe("ModelRouter — modèles de secours configurés", () => {
  it("déduit le fournisseur d'un identifiant et lit la liste stockée", async () => {
    const { parseFallbackModels } = await import("../llm/modelRouter");
    assert.deepEqual(parseFallbackModels('["gemini-3.6-flash","@cf/meta/llama-3.1-8b-instruct-fp8","openai:gpt-5-mini","inconnu:x"]'), [
      { provider: "gemini", model: "gemini-3.6-flash" },
      { provider: "cloudflare", model: "@cf/meta/llama-3.1-8b-instruct-fp8" },
      { provider: "openai", model: "gpt-5-mini" },
      { provider: "gemini", model: "inconnu:x" },
    ]);
    assert.deepEqual(parseFallbackModels("gemini-3-flash-preview, gemini-2.5-flash"), [
      { provider: "gemini", model: "gemini-3-flash-preview" },
      { provider: "gemini", model: "gemini-2.5-flash" },
    ]);
    assert.deepEqual(parseFallbackModels(null), []);
  });

  it("essaie le principal puis chaque secours dans l'ordre, et trace le modèle demandé", async () => {
    const router = new ModelRouter(cfg);
    router.updateSettings([
      { action_type: "demo", provider: "gemini", model: "gemini-3.8-flash", fallback_models: '["gemini-3.6-flash","gemini-3.5-flash-lite"]' },
    ]);
    const tried: string[] = [];
    (router as unknown as { dispatch: unknown }).dispatch = async (c: { model: string }, req: { usageSink: Array<Record<string, unknown>> }) => {
      tried.push(c.model);
      if (c.model !== "gemini-3.5-flash-lite") throw new Error("429 RESOURCE_EXHAUSTED");
      req.usageSink.push({ task: "demo", model: c.model });
      return { text: "ok", model: c.model, provider: "gemini" };
    };
    const usage: Array<Record<string, unknown>> = [];
    const res = await router.generate({ task: "demo", prompt: "x", usageSink: usage } as never);
    assert.deepEqual(tried, ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite"]);
    assert.equal(res.model, "gemini-3.5-flash-lite");
    assert.equal(usage[0]?.requestedModel, "gemini-3.8-flash");
  });

  it("sans liste de secours, garde le filet historique Gemini 3 Flash", () => {
    const router = new ModelRouter(cfg);
    router.updateSettings([{ action_type: "audit", provider: "cloudflare", model: "@cf/x" }]);
    const chain = router.chainFor({ provider: "cloudflare", model: "@cf/x", thinkingBudget: 0, fallbacks: [] });
    assert.deepEqual(chain.map((c) => c.model), ["@cf/x", "gemini-3-flash-preview"]);
  });

  it("échoue clairement quand toute la chaîne est en quota", async () => {
    const router = new ModelRouter(cfg);
    router.updateSettings([{ action_type: "demo", provider: "gemini", model: "a-model", fallback_models: '["b-model"]' }]);
    (router as unknown as { dispatch: unknown }).dispatch = async () => {
      throw new Error("429 quota");
    };
    await assert.rejects(router.generate({ task: "demo", prompt: "x" } as never), /429 quota/);
  });
});
