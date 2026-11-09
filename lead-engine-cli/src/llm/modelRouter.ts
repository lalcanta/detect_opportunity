import { GoogleGenAI, type Part } from "@google/genai";
import type { Config } from "../config";
import type { TokenUsageRecord } from "../types";
import { log, sleep, stripCodeFences } from "../utils/helpers";

export type ActionType = "demo" | "audit" | "battlecard" | "TASK_HEAVY" | "TASK_FAST";
export type ModelProvider = "gemini" | "openai" | "anthropic" | "openrouter" | "cloudflare";

export interface ImageInput {
  mimeType: string;
  data: Buffer;
}

export interface GenerateRequest {
  task: ActionType;
  prompt: string;
  system?: string;
  images?: ImageInput[];
  /** Force une sortie application/json */
  json?: boolean;
  /** Collecte la consommation de tokens (remontée au dashboard) */
  usageSink?: TokenUsageRecord[];
}

export interface GenerateResult {
  text: string;
  model: string;
  provider: ModelProvider;
}

export interface ActionModelConfig {
  provider: ModelProvider;
  model: string;
  thinkingBudget: number;
}

interface KeySlot {
  label: string;
  client: GoogleGenAI;
  cooldownUntil: Map<string, number>;
}

const COOLDOWN_MS = 60_000;

export class ModelRouter {
  private readonly geminiSlots: KeySlot[] = [];
  private geminiCursor = 0;
  private readonly cfg: Config;
  private actionConfigs: Map<string, ActionModelConfig>;

  constructor(cfg: Config) {
    this.cfg = cfg;
    const geminiKeys = [cfg.GEMINI_API_KEY_1, cfg.GEMINI_API_KEY_2].filter(
      (k): k is string => typeof k === "string" && k.trim().length > 0,
    );
    this.geminiSlots = geminiKeys.map((k, i) => ({
      label: `GEMINI_KEY_${i + 1}`,
      client: new GoogleGenAI({ apiKey: k }),
      cooldownUntil: new Map(),
    }));

    // Configurations par défaut (Cloudflare Workers AI 0€ natif)
    this.actionConfigs = new Map<string, ActionModelConfig>([
      ["demo", { provider: "cloudflare", model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", thinkingBudget: 0 }],
      ["audit", { provider: "cloudflare", model: "@cf/meta/llama-3.1-8b-instruct-fp8", thinkingBudget: 0 }],
      ["battlecard", { provider: "cloudflare", model: "@cf/meta/llama-3.1-8b-instruct-fp8", thinkingBudget: 0 }],
      ["TASK_HEAVY", { provider: "cloudflare", model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", thinkingBudget: 0 }],
      ["TASK_FAST", { provider: "cloudflare", model: "@cf/meta/llama-3.1-8b-instruct-fp8", thinkingBudget: 0 }],
    ]);
  }

  /** Met à jour dynamiquement la configuration des modèles depuis l'admin du dashboard. */
  updateSettings(settings: { action_type: string; provider: string; model: string; thinking_budget?: number }[]): void {
    for (const s of settings) {
      if (!s.action_type || !s.provider || !s.model) continue;
      this.actionConfigs.set(s.action_type, {
        provider: s.provider as ModelProvider,
        model: s.model.trim(),
        thinkingBudget: Number(s.thinking_budget) || 0,
      });
      if (s.action_type === "demo") {
        this.actionConfigs.set("TASK_HEAVY", {
          provider: s.provider as ModelProvider,
          model: s.model.trim(),
          thinkingBudget: Number(s.thinking_budget) || 0,
        });
      }
    }
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const config = this.actionConfigs.get(req.task) ?? {
      provider: "gemini",
      model: "gemini-3-flash-preview",
      thinkingBudget: 0,
    };

    switch (config.provider) {
      case "cloudflare":
        return await this.callCloudflareWorkersAi(config, req);
      case "openai":
        return await this.callOpenAI(config, req, false);
      case "openrouter":
        return await this.callOpenAI(config, req, true);
      case "anthropic":
        return await this.callAnthropic(config, req);
      case "gemini":
      default:
        return await this.callGeminiWithFallback(config, req);
    }
  }

  /* ------------------- CLOUDFLARE WORKERS AI ------------------- */

  private async callCloudflareWorkersAi(config: ActionModelConfig, req: GenerateRequest): Promise<GenerateResult> {
    try {
      const res = await fetch(`${this.cfg.REMOTE_APP_URL}/api/worker/ai/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.cfg.SYNC_SECRET_TOKEN}`,
        },
        body: JSON.stringify({
          model: config.model,
          prompt: req.prompt,
          system: req.system,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} sur /api/worker/ai/run`);
      const data = (await res.json()) as { ok?: boolean; text?: string; error?: string };
      if (!data.ok || !data.text) throw new Error(data.error || "Réponse Workers AI vide");
      return {
        text: data.text,
        model: config.model,
        provider: "cloudflare",
      };
    } catch (err) {
      log("llm", `Workers AI (${config.model}) indisponible : ${(err as Error).message} → repli Gemini`);
      return await this.callGeminiWithFallback(config, req);
    }
  }

  /* ------------------- GEMINI ------------------- */

  private async callGeminiWithFallback(config: ActionModelConfig, req: GenerateRequest): Promise<GenerateResult> {
    const fallbackModel = "gemini-3-flash-preview";
    const modelsToTry =
      config.model === fallbackModel || config.model.startsWith("@cf/") || config.provider === "cloudflare"
        ? [fallbackModel]
        : [config.model, fallbackModel];
    let lastError: unknown;

    for (const model of modelsToTry) {
      for (let attempt = 0; attempt < Math.max(1, this.geminiSlots.length); attempt++) {
        const slot = this.pickGeminiSlot(model);
        if (!slot) continue;
        try {
          return await this.executeGemini(slot, model, config.thinkingBudget, req);
        } catch (err) {
          if (!isRetryable(err)) throw err;
          slot.cooldownUntil.set(model, Date.now() + COOLDOWN_MS);
          lastError = err;
          log("llm", `${slot.label}/${model} indisponible → bascule`);
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Échec Gemini : aucun slot disponible");
  }

  private pickGeminiSlot(model: string): KeySlot | null {
    const now = Date.now();
    for (let i = 0; i < this.geminiSlots.length; i++) {
      const idx = (this.geminiCursor + i) % this.geminiSlots.length;
      const slot = this.geminiSlots[idx];
      if (slot && (slot.cooldownUntil.get(model) ?? 0) <= now) {
        this.geminiCursor = (idx + 1) % this.geminiSlots.length;
        return slot;
      }
    }
    return null;
  }

  private async executeGemini(
    slot: KeySlot,
    model: string,
    thinkingBudget: number,
    req: GenerateRequest,
  ): Promise<GenerateResult> {
    const parts: Part[] = [{ text: req.prompt }];
    for (const img of req.images ?? []) {
      parts.push({ inlineData: { mimeType: img.mimeType, data: img.data.toString("base64") } });
    }
    const res = await slot.client.models.generateContent({
      model,
      contents: [{ role: "user", parts }],
      config: {
        systemInstruction: req.system,
        ...(thinkingBudget > 0 ? { thinkingConfig: { thinkingBudget } } : {}),
        ...(req.json ? { responseMimeType: "application/json" } : {}),
      },
    });
    const text = res.text ?? "";
    if (!text.trim()) throw new Error(`Réponse vide de ${model}`);

    req.usageSink?.push({
      task: req.task,
      model,
      inputTokens: res.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: res.usageMetadata?.candidatesTokenCount ?? 0,
      thinkingTokens: res.usageMetadata?.thoughtsTokenCount ?? 0,
    });
    return { text, model, provider: "gemini" };
  }

  /* ------------------- OPENAI & OPENROUTER ------------------- */

  private async callOpenAI(
    config: ActionModelConfig,
    req: GenerateRequest,
    isOpenRouter: boolean,
  ): Promise<GenerateResult> {
    const apiKey = isOpenRouter ? this.cfg.OPENROUTER_API_KEY : this.cfg.OPENAI_API_KEY;
    if (!apiKey) {
      log("llm", `Clé ${isOpenRouter ? "OPENROUTER_API_KEY" : "OPENAI_API_KEY"} absente → repli sur Gemini`);
      return this.callGeminiWithFallback({ provider: "gemini", model: "gemini-3-flash-preview", thinkingBudget: 0 }, req);
    }
    const endpoint = isOpenRouter
      ? "https://openrouter.ai/api/v1/chat/completions"
      : `${this.cfg.OPENAI_BASE_URL.replace(/\/+$/, "")}/chat/completions`;

    const userContent: unknown[] = [{ type: "text", text: req.prompt }];
    for (const img of req.images ?? []) {
      userContent.push({
        type: "image_url",
        image_url: { url: `data:${img.mimeType};base64,${img.data.toString("base64")}` },
      });
    }

    const messages: unknown[] = [];
    if (req.system) messages.push({ role: "system", content: req.system });
    messages.push({ role: "user", content: userContent });

    const payload: Record<string, unknown> = {
      model: config.model,
      messages,
      ...(req.json ? { response_format: { type: "json_object" } } : {}),
    };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...(isOpenRouter ? { "HTTP-Referer": "http://localhost:8788" } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errTxt = await res.text().catch(() => "");
      log("llm", `Erreur ${config.provider} (${res.status}) : ${errTxt.slice(0, 150)} → repli Gemini`);
      return this.callGeminiWithFallback({ provider: "gemini", model: "gemini-3-flash-preview", thinkingBudget: 0 }, req);
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text = data.choices?.[0]?.message?.content ?? "";
    if (!text.trim()) throw new Error(`Réponse vide reçue de ${config.model}`);

    req.usageSink?.push({
      task: req.task,
      model: config.model,
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
      thinkingTokens: 0,
    });
    return { text, model: config.model, provider: config.provider };
  }

  /* ------------------- ANTHROPIC CLAUDE ------------------- */

  private async callAnthropic(config: ActionModelConfig, req: GenerateRequest): Promise<GenerateResult> {
    const apiKey = this.cfg.ANTHROPIC_API_KEY;
    if (!apiKey) {
      log("llm", "Clé ANTHROPIC_API_KEY absente → repli sur Gemini");
      return this.callGeminiWithFallback({ provider: "gemini", model: "gemini-3-flash-preview", thinkingBudget: 0 }, req);
    }

    const content: unknown[] = [];
    for (const img of req.images ?? []) {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: img.mimeType,
          data: img.data.toString("base64"),
        },
      });
    }
    content.push({ type: "text", text: req.prompt });

    const thinkingBudget = config.thinkingBudget;
    const payload: Record<string, unknown> = {
      model: config.model,
      max_tokens: thinkingBudget > 0 ? Math.max(8192, thinkingBudget + 4096) : 4096,
      ...(req.system ? { system: req.system } : {}),
      messages: [{ role: "user", content }],
      ...(thinkingBudget >= 1024 ? { thinking: { type: "enabled", budget_tokens: thinkingBudget } } : {}),
    };

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errTxt = await res.text().catch(() => "");
      log("llm", `Erreur Anthropic (${res.status}) : ${errTxt.slice(0, 150)} → repli Gemini`);
      return this.callGeminiWithFallback({ provider: "gemini", model: "gemini-3-flash-preview", thinkingBudget: 0 }, req);
    }

    const data = (await res.json()) as {
      content?: { type: string; text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const text = data.content?.find((c) => c.type === "text")?.text ?? "";
    if (!text.trim()) throw new Error(`Réponse vide reçue de ${config.model}`);

    req.usageSink?.push({
      task: req.task,
      model: config.model,
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
      thinkingTokens: 0,
    });
    return { text: req.json ? stripCodeFences(text) : text, model: config.model, provider: "anthropic" };
  }
}

function isRetryable(err: unknown): boolean {
  const e = err as { status?: number; code?: number; message?: string };
  if (
    e.status === 429 ||
    e.code === 429 ||
    e.status === 503 ||
    e.code === 503 ||
    e.status === 404 ||
    e.code === 404
  ) {
    return true;
  }
  return /\b429\b|\b404\b|RESOURCE_EXHAUSTED|quota|rate.?limit|overloaded|UNAVAILABLE|not available|not found/i.test(
    e.message ?? "",
  );
}
