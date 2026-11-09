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
