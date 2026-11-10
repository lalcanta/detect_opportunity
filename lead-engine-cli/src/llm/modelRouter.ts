import { GoogleGenAI, type Part } from "@google/genai";
import type { Config } from "../config";
import type { TokenUsageRecord } from "../types";
import { log, sleep, stripCodeFences } from "../utils/helpers";
import { parseGeminiQuotaError, quotaCooldownMs, type GeminiQuotaError } from "../../../shared/llm/geminiQuotas";

export type ActionType = "demo" | "audit" | "battlecard" | "TASK_HEAVY" | "TASK_FAST";
export type ModelProvider = "gemini" | "openai" | "anthropic" | "openrouter" | "cloudflare" | "cli";

/** Levée quand une action est réglée sur le provider "cli" (coupe-circuit 0 €) : aucune API ne doit être appelée. */
export class ZeroCostModeError extends Error {
  constructor(task: string) {
    super(`Mode CLI 0 € actif pour « ${task} » : aucun appel API autorisé (génération à confier à l'agent CLI).`);
    this.name = "ZeroCostModeError";
  }
}

const GENERATIVE_ACTIONS = ["demo", "audit", "battlecard"] as const;

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
  /** Modèles de secours essayés dans l'ordre si le principal échoue (quota, surcharge, modèle inexistant). */
  fallbacks?: ModelRef[];
}

export interface ModelRef {
  provider: ModelProvider;
  model: string;
}

/** Filet de sécurité historique quand aucune liste de secours n'est configurée. */
const LEGACY_FALLBACK: ModelRef = { provider: "gemini", model: "gemini-3-flash-preview" };

const PROVIDERS: readonly ModelProvider[] = ["gemini", "openai", "anthropic", "openrouter", "cloudflare"];

/** Fournisseur d'un identifiant de modèle : préfixe explicite « fournisseur:modèle », sinon déduit du nom. */
export function parseModelRef(raw: string): ModelRef | null {
  const v = raw.trim();
  if (!v) return null;
  const m = v.match(/^(gemini|openai|anthropic|openrouter|cloudflare):(.+)$/);
  if (m) return { provider: m[1] as ModelProvider, model: m[2]!.trim() };
  if (v.startsWith("@cf/")) return { provider: "cloudflare", model: v };
  if (/^(gemini|gemma)/i.test(v)) return { provider: "gemini", model: v };
  if (/^claude/i.test(v)) return { provider: "anthropic", model: v };
  if (v.includes("/")) return { provider: "openrouter", model: v };
  if (/^(gpt|o\d)/i.test(v)) return { provider: "openai", model: v };
  return { provider: "gemini", model: v };
}

/** Liste de secours stockée en JSON (ou texte séparé par des virgules) ; vide ou illisible = aucune. */
export function parseFallbackModels(raw: unknown): ModelRef[] {
  let items: unknown[] = [];
  if (Array.isArray(raw)) items = raw;
  else if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      items = Array.isArray(parsed) ? parsed : [];
    } catch {
      items = raw.split(",");
    }
  }
  return items
    .filter((x): x is string => typeof x === "string")
    .map(parseModelRef)
    .filter((r): r is ModelRef => r !== null && PROVIDERS.includes(r.provider))
    .slice(0, 5);
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
  updateSettings(
    settings: { action_type: string; provider: string; model: string; thinking_budget?: number; fallback_models?: unknown }[],
  ): void {
    for (const s of settings) {
      if (!s.action_type || !s.provider || !s.model) continue;
      const cfg: ActionModelConfig = {
        provider: s.provider as ModelProvider,
        model: s.model.trim(),
        thinkingBudget: Number(s.thinking_budget) || 0,
        fallbacks: parseFallbackModels(s.fallback_models),
      };
      this.actionConfigs.set(s.action_type, cfg);
      if (s.action_type === "demo") this.actionConfigs.set("TASK_HEAVY", { ...cfg });
    }
  }

  /** Chaîne essayée pour une action : principal, puis secours configurés (ou le filet historique Gemini 3 Flash). */
  chainFor(config: ActionModelConfig): ModelRef[] {
    const chain: ModelRef[] = [{ provider: config.provider, model: config.model }];
    const backups = config.fallbacks?.length ? config.fallbacks : [LEGACY_FALLBACK];
    for (const b of backups) {
      if (!chain.some((c) => c.provider === b.provider && c.model === b.model)) chain.push(b);
    }
    return chain;
  }

  /** Vrai si le coupe-circuit a basculé toutes les actions génératives en provider "cli". */
  isZeroCostMode(): boolean {
    return GENERATIVE_ACTIONS.every((a) => this.actionConfigs.get(a)?.provider === "cli");
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const config = this.actionConfigs.get(req.task) ?? {
      provider: "gemini",
      model: "gemini-3-flash-preview",
      thinkingBudget: 0,
    };

    if (config.provider === "cli") throw new ZeroCostModeError(req.task);
    // Un fournisseur inconnu ne doit pas retomber silencieusement sur une API payante.
    if (!PROVIDERS.includes(config.provider)) throw new Error(`Provider IA inconnu « ${String(config.provider)} » pour « ${req.task} »`);

    // Chaîne de modèles : le premier qui répond l'emporte. Les consommations d'un secours gardent le modèle configuré.
    const before = req.usageSink?.length ?? 0;
    const chain = this.chainFor(config);
    let lastError: unknown;
    for (let i = 0; i < chain.length; i++) {
      const ref = chain[i]!;
      try {
        const result = await this.dispatch({ ...config, provider: ref.provider, model: ref.model }, req);
        if (req.usageSink && result.model !== config.model) {
          for (const rec of req.usageSink.slice(before)) rec.requestedModel = config.model;
        }
        return result;
      } catch (err) {
        if (err instanceof ZeroCostModeError) throw err;
        lastError = err;
        const next = chain[i + 1];
        log(
          "llm",
          `${ref.provider}/${ref.model} indisponible pour « ${req.task} » : ${(err as Error).message.split("\n")[0]?.slice(0, 160)}` +
            (next ? ` → bascule sur ${next.provider}/${next.model}` : " → plus de modèle de secours"),
        );
      }
    }
    throw lastError instanceof Error ? lastError : new Error(`Aucun modèle disponible pour « ${req.task} »`);
  }

  private async dispatch(config: ActionModelConfig, req: GenerateRequest): Promise<GenerateResult> {
    switch (config.provider) {
      case "cloudflare":
        return await this.callCloudflareWorkersAi(config, req);
      case "openai":
        return await this.callOpenAI(config, req, false);
      case "openrouter":
        return await this.callOpenAI(config, req, true);
      case "anthropic":
        return await this.callAnthropic(config, req);
      case "cli":
        throw new ZeroCostModeError(req.task);
      case "gemini":
        return await this.callGemini(config, req);
      default:
        // Un provider inconnu ne doit pas retomber silencieusement sur une API payante.
        throw new Error(`Provider IA inconnu « ${String(config.provider)} » pour « ${req.task} »`);
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
          max_tokens: 8192,
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} sur /api/worker/ai/run${detail ? ` : ${detail.slice(0, 160)}` : ""}`);
      }
      const data = (await res.json()) as {
        ok?: boolean;
        text?: string;
        error?: string;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      if (!data.ok || !data.text) throw new Error(data.error || "Réponse Workers AI vide");

      req.usageSink?.push({
        task: req.task,
        model: config.model,
        inputTokens: data.usage?.prompt_tokens ?? Math.ceil(((req.prompt?.length || 0) + (req.system?.length || 0)) / 4),
        outputTokens: data.usage?.completion_tokens ?? Math.ceil(data.text.length / 4),
        thinkingTokens: 0,
      });

      return {
        text: data.text,
        model: config.model,
        provider: "cloudflare",
      };
    } catch (err) {
      throw new Error(`Workers AI (${config.model}) : ${(err as Error).message}`);
    }
  }

  /* ------------------- GEMINI ------------------- */

  /** Un seul modèle Gemini, en alternant les clés API ; une clé en quota est mise en pause 60 s pour ce modèle. */
  private async callGemini(config: ActionModelConfig, req: GenerateRequest): Promise<GenerateResult> {
    const model = config.model;
    let lastError: unknown;
    for (let attempt = 0; attempt < Math.max(1, this.geminiSlots.length); attempt++) {
      const slot = this.pickGeminiSlot(model);
      if (!slot) break;
      try {
        return await this.executeGemini(slot, model, config.thinkingBudget, req);
      } catch (err) {
        lastError = err;
        if (!isRetryable(err)) break;
        const quota = parseGeminiQuotaError(err);
        const pauseMs = quota ? quotaCooldownMs(quota) : COOLDOWN_MS;
        slot.cooldownUntil.set(model, Date.now() + pauseMs);
        log("llm", `${slot.label}/${model} ${describeQuotaPause(quota, pauseMs)} → clé suivante`);
      }
    }
    if (this.geminiSlots.length === 0) throw new Error("Aucune clé GEMINI_API_KEY configurée");
    throw lastError instanceof Error ? lastError : new Error(`${model} : toutes les clés sont en pause (quota)`);
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
    if (!apiKey) throw new Error(`Clé ${isOpenRouter ? "OPENROUTER_API_KEY" : "OPENAI_API_KEY"} absente`);
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
      throw new Error(`${config.provider} HTTP ${res.status} : ${errTxt.slice(0, 150)}`);
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
    if (!apiKey) throw new Error("Clé ANTHROPIC_API_KEY absente");

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
      throw new Error(`Anthropic HTTP ${res.status} : ${errTxt.slice(0, 150)}`);
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

/** Message de log : quelle limite est atteinte et jusqu'à quand le modèle est mis de côté. */
export function describeQuotaPause(quota: GeminiQuotaError | null, pauseMs: number): string {
  if (!quota) return `indisponible, en pause ${Math.round(pauseMs / 1000)} s`;
  if (quota.scope === "day") {
    const until = new Date(Date.now() + pauseMs).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    return `quota du jour atteint${quota.limit ? ` (${quota.limit} requêtes)` : ""}, en pause jusqu'à ${until}`;
  }
  const what = quota.scope === "minute" ? "quota par minute atteint" : "quota atteint";
  return `${what}, en pause ${Math.round(pauseMs / 1000)} s`;
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
