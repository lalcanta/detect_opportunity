import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { geminiDayStart, geminiNextReset, parseGeminiQuotaError, quotaCooldownMs, toSqlTimestamp } from "../../../shared/llm/geminiQuotas";
import { buildGeminiQuotaRows, geminiModelOf, parseQuotaLimit } from "../services/geminiQuota";
import { modelPickerScript, renderFallbackPicker } from "../views/modelPicker";

describe("journée de quota Gemini (minuit, heure du Pacifique)", () => {
  it("heure d'hiver : minuit = 08:00 UTC", () => {
    const now = Date.UTC(2026, 10, 10, 20, 0); // 10 nov. 2026, 12:00 à Los Angeles
    assert.equal(toSqlTimestamp(geminiDayStart(now)), "2026-11-10 08:00:00");
    assert.equal(new Date(geminiNextReset(now)).toISOString(), "2026-11-11T08:00:00.000Z");
  });
  it("heure d'été : minuit = 07:00 UTC, et avant minuit on reste sur la veille", () => {
    assert.equal(toSqlTimestamp(geminiDayStart(Date.UTC(2026, 6, 15, 12))), "2026-07-15 07:00:00");
    assert.equal(toSqlTimestamp(geminiDayStart(Date.UTC(2026, 6, 15, 6, 59))), "2026-07-14 07:00:00");
  });
  it("le jour du changement d'heure, la remise à zéro suivante tombe bien le lendemain", () => {
    const now = Date.UTC(2026, 10, 1, 9); // 1er nov. 2026, passage à l'heure d'hiver
    assert.equal(new Date(geminiNextReset(now)).toISOString(), "2026-11-02T08:00:00.000Z");
  });
});

describe("lecture des erreurs 429 Gemini", () => {
  const body = (quotaId: string, delay = "37s") =>
    Object.assign(
      new Error(
        `got status: 429 Too Many Requests. ${JSON.stringify({
          error: {
            code: 429,
            status: "RESOURCE_EXHAUSTED",
            details: [
              { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId, quotaValue: "20" }] },
              { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: delay },
            ],
          },
        })}`,
      ),
      { status: 429 },
    );

  it("quota par jour : pause jusqu'à la remise à zéro", () => {
    const q = parseGeminiQuotaError(body("GenerateRequestsPerDayPerProjectPerModel-FreeTier"));
    assert.deepEqual(q, { scope: "day", retryMs: 37_000, quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier", limit: 20 });
    const now = Date.UTC(2026, 10, 10, 20);
    assert.equal(quotaCooldownMs(q!, now), Date.UTC(2026, 10, 11, 8) - now);
  });
  it("quota par minute : pause du délai conseillé", () => {
    const q = parseGeminiQuotaError(body("GenerateRequestsPerMinutePerProjectPerModel-FreeTier", "12.5s"));
    assert.equal(q?.scope, "minute");
    assert.equal(quotaCooldownMs(q!), 12_500);
  });
  it("429 sans détail : 60 s ; autre erreur : rien", () => {
    const q = parseGeminiQuotaError(Object.assign(new Error("quota"), { status: 429 }));
    assert.equal(q?.scope, "unknown");
    assert.equal(quotaCooldownMs(q!), 60_000);
    assert.equal(parseGeminiQuotaError(new Error("503 UNAVAILABLE")), null);
  });
});

describe("carte Quotas Gemini du jour", () => {
  it("compte les appels des modèles principaux et de secours, avec la limite console ou saisie", () => {
    const rows = buildGeminiQuotaRows({
      settings: [
        { action_type: "demo", provider: "gemini", model: "gemini-3.5-flash-lite", fallback_models: '["gemini:gemini-2.5-flash-lite","anthropic:claude-5-sonnet"]' },
        { action_type: "audit", provider: "cloudflare", model: "@cf/meta/llama-3.1-8b-instruct-fp8" },
      ],
      overrides: [{ model: "gemini-2.5-flash-lite", rpm: null, rpd: 40 }],
      callsToday: [
        { model: "gemini-3.5-flash-lite", n: 450 },
        { model: "gemini-3-flash-preview", n: 20 },
        { model: "@cf/meta/llama-3.1-8b-instruct-fp8", n: 9 },
      ],
    });
    assert.deepEqual(rows.map((r) => r.model), ["gemini-3.5-flash-lite", "gemini-3-flash-preview", "gemini-2.5-flash-lite"]);
    assert.equal(rows[0]?.state, "warning");
    assert.deepEqual(rows[0]?.usedBy, ["Démo"]);
    assert.equal(rows[2]?.rpd, 40);
    assert.equal(rows[2]?.custom, true);
    assert.deepEqual(rows[2]?.usedBy, ["Démo (secours 1)"]);
    assert.equal(rows[1]?.state, "exhausted");
    assert.deepEqual(rows[1]?.usedBy, ["Audit (secours par défaut)"], "sans secours configuré, le worker retombe sur gemini-3-flash-preview");
  });
  it("reconnaît un modèle Gemini et valide les limites saisies", () => {
    assert.equal(geminiModelOf("gemma-4-31b-it"), "gemma-4-31b-it");
    assert.equal(geminiModelOf("openai:gpt-5"), null);
    assert.equal(geminiModelOf("gemini-3.5-flash-lite", "openrouter"), null);
    assert.equal(parseQuotaLimit(""), null);
    assert.equal(parseQuotaLimit("500"), 500);
    assert.equal(parseQuotaLimit("-1"), "invalid");
    assert.equal(parseQuotaLimit("1.5"), "invalid");
  });
});

describe("composant sélecteur de modèle", () => {
  it("garde la liste de secours dans le champ caché envoyé à l'enregistrement", () => {
    const html = renderFallbackPicker("demo", '["gemini-3.1-flash-lite","gemini-2.5-flash-lite"]');
    assert.match(html, /id="fb_demo" value="gemini-3.1-flash-lite, gemini-2.5-flash-lite"/);
    assert.match(html, /id="fb_search_demo"/);
  });
  it("script navigateur syntaxiquement valide, lisant le catalogue nommé", () => {
    const js = modelPickerScript("ALL_MODELS");
    assert.doesNotThrow(() => new Function("ALL_MODELS", "document", js));
    assert.match(js, /ALL_MODELS\.find/);
  });
});
