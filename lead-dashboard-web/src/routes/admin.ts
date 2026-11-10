import { ALL_OPPORTUNITY_IDS } from "../../../shared/opportunities";
import { Hono } from "hono";
import type { AppEnv } from "../types";
import { requireUser, bearerMatches } from "../auth";
import { assignRoundRobin } from "../services/assign";

export const adminRoutes = new Hono<AppEnv>();

interface AssignBody {
  mode?: "round_robin" | "manual";
  leadId?: string;
  userId?: string | null;
}

/** POST /api/admin/assign — round-robin sur les non assignés, ou réassignation manuelle. */
adminRoutes.post("/api/admin/assign", requireUser("admin"), async (c) => {
  const body = await c.req.json<AssignBody>().catch(() => ({}) as AssignBody);
  if (body.mode === "round_robin") {
    return c.json({ ok: true, assigned: await assignRoundRobin(c.env.DB) });
  }
  if (body.mode === "manual" && body.leadId) {
    if (body.userId) {
      const u = await c.env.DB.prepare("SELECT id FROM users WHERE id = ? AND role = 'closer' AND is_active = 1")
        .bind(body.userId)
        .first();
      if (!u) return c.json({ error: "invalid_user" }, 400);
    }
    await c.env.DB.prepare("UPDATE leads SET assigned_to = ?, assigned_at = ? WHERE id = ?")
      .bind(body.userId ?? null, body.userId ? new Date().toISOString() : null, body.leadId)
      .run();
    return c.json({ ok: true });
  }
  return c.json({ error: "invalid_request" }, 400);
});

/** POST /api/admin/users — création d'un utilisateur dans la Whitelist avec lien d'invitation. */
adminRoutes.post("/api/admin/users", requireUser("admin"), async (c) => {
  const body = await c.req
    .json<{ name?: string; email?: string; quota?: number; opportunities?: string[] }>()
    .catch(() => ({}) as { name?: string; email?: string; quota?: number; opportunities?: string[] });
  if (!body.name?.trim()) return c.json({ error: "name_required" }, 400);
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const token = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  const inviteBytes = crypto.getRandomValues(new Uint8Array(16));
  const inviteCode = `inv_${[...inviteBytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
  const id = `u_${token.slice(0, 8)}`;
  const email = body.email?.trim().toLowerCase() || `${id}@agence.local`;
  const opps =
    Array.isArray(body.opportunities) && body.opportunities.length > 0
      ? JSON.stringify(body.opportunities)
      : JSON.stringify(ALL_OPPORTUNITY_IDS);

  try {
    await c.env.DB.prepare(
      "INSERT INTO users (id, name, email, invite_code, invited_at, role, phone_quota_weekly, access_token, allowed_opportunities) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, 'closer', ?, ?, ?)",
    )
      .bind(id, body.name.trim(), email, inviteCode, body.quota ?? 100, token, opps)
      .run();
  } catch (e) {
    return c.json({ error: "email_already_exists", detail: (e as Error).message }, 400);
  }

  return c.json({
    ok: true,
    id,
    email,
    invite_code: inviteCode,
    access_token: token,
    allowed_opportunities: JSON.parse(opps),
  });
});

/** POST /api/admin/users/:id/reinvite — régénère un code d'invitation pour renvoyer un mail d'accès. */
adminRoutes.post("/api/admin/users/:id/reinvite", requireUser("admin"), async (c) => {
  const inviteBytes = crypto.getRandomValues(new Uint8Array(16));
  const inviteCode = `inv_${[...inviteBytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
  await c.env.DB.prepare("UPDATE users SET invite_code = ?, invited_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(inviteCode, c.req.param("id"))
    .run();
  return c.json({ ok: true, id: c.req.param("id"), invite_code: inviteCode });
});

/** POST /api/admin/users/:id/email — met à jour l'adresse email en Whitelist d'un utilisateur. */
adminRoutes.post("/api/admin/users/:id/email", requireUser("admin"), async (c) => {
  const body = await c.req.json<{ email?: string }>().catch(() => ({}) as { email?: string });
  const email = body.email?.trim().toLowerCase();
  if (!email || !email.includes("@")) return c.json({ error: "valid_email_required" }, 400);
  await c.env.DB.prepare("UPDATE users SET email = ? WHERE id = ?")
    .bind(email, c.req.param("id"))
    .run();
  return c.json({ ok: true, id: c.req.param("id"), email });
});

/** POST /api/admin/users/:id/opportunities — configure les types d'opportunités activés pour un closer. */
adminRoutes.post("/api/admin/users/:id/opportunities", requireUser("admin"), async (c) => {
  const body = await c.req.json<{ opportunities?: string[] }>().catch(() => ({}) as { opportunities?: string[] });
  if (!body.opportunities || !Array.isArray(body.opportunities) || body.opportunities.length === 0) {
    return c.json({ error: "at_least_one_opportunity_required" }, 400);
  }
  const oppsJson = JSON.stringify(body.opportunities);
  await c.env.DB.prepare("UPDATE users SET allowed_opportunities = ? WHERE id = ? AND role = 'closer'")
    .bind(oppsJson, c.req.param("id"))
    .run();
  return c.json({ ok: true, id: c.req.param("id"), allowed_opportunities: body.opportunities });
});

/** POST /api/admin/users/:id/toggle — active / désactive un utilisateur. */
adminRoutes.post("/api/admin/users/:id/toggle", requireUser("admin"), async (c) => {
  await c.env.DB.prepare("UPDATE users SET is_active = 1 - is_active WHERE id = ? AND id != ?")
    .bind(c.req.param("id"), c.get("user").id)
    .run();
  return c.json({ ok: true });
});

export interface ModelSettingRow {
  action_type: string;
  provider: string;
  model: string;
  thinking_budget: number;
}

/** GET /api/admin/models — liste la configuration et les modèles disponibles. */
adminRoutes.get("/api/admin/models", requireUser("admin"), async (c) => {
  const r = await c.env.DB.prepare("SELECT * FROM model_settings").all<ModelSettingRow>();
  const available = await listAvailableModels(c.env.DB);
  return c.json({ ok: true, settings: r.results, available });
});

/** POST /api/admin/models/refresh — interroge l'API des fournisseurs pour actualiser le catalogue en cache. */
adminRoutes.post("/api/admin/models/refresh", requireUser("admin"), async (c) => {
  const now = new Date().toISOString();

  // Insertion / mise à jour des flagships des fournisseurs majeurs (Anthropic Claude 5 / 5.5, OpenAI GPT-5, OpenRouter)
  const baseModels = [
    // Anthropic (Génération 5 et 5.5)
    { provider: "anthropic", model_id: "claude-5-5-opus", display_name: "Claude Opus 5.5 (Code d'élite & Raisonnement)", desc: "Modèle le plus puissant d'Anthropic pour les architectures complexes.", vision: 1, thinking: 1, flagship: 1, speed: "deep", cost: "premium", ctx: "200k tokens" },
    { provider: "anthropic", model_id: "claude-5-sonnet", display_name: "Claude Sonnet 5 (Top Design & Frontend)", desc: "Référence pour les refontes Tailwind et les intégrations web haute fidélité.", vision: 1, thinking: 1, flagship: 1, speed: "fast", cost: "standard", ctx: "200k tokens" },
    { provider: "anthropic", model_id: "claude-5-haiku", display_name: "Claude Haiku 5 (Ultra-rapide)", desc: "Exécution ultra-rapide pour l'audit et l'analyse de premier niveau.", vision: 1, thinking: 0, flagship: 1, speed: "ultra", cost: "eco", ctx: "200k tokens" },
    // OpenAI (Génération GPT-5 et o3)
    { provider: "openai", model_id: "gpt-5", display_name: "OpenAI GPT-5 (Flagship Multimodal)", desc: "Modèle multimodal de pointe pour génération et vision détaillée.", vision: 1, thinking: 1, flagship: 1, speed: "fast", cost: "premium", ctx: "256k tokens" },
    { provider: "openai", model_id: "gpt-5-mini", display_name: "OpenAI GPT-5 Mini (Rapide & Économique)", desc: "Version condensée de GPT-5, ultra-rapide et économique.", vision: 1, thinking: 0, flagship: 1, speed: "ultra", cost: "eco", ctx: "128k tokens" },
    { provider: "openai", model_id: "o3", display_name: "OpenAI o3 (Raisonnement Approfondi)", desc: "Modèle de réflexion mathématique et logique poussée.", vision: 1, thinking: 1, flagship: 1, speed: "deep", cost: "premium", ctx: "200k tokens" },
    { provider: "openai", model_id: "o3-mini", display_name: "OpenAI o3-mini (Thinking Économique)", desc: "Thinking à coût maîtrisé et latence modérée.", vision: 0, thinking: 1, flagship: 1, speed: "deep", cost: "eco", ctx: "128k tokens" },
    // OpenRouter
    { provider: "openrouter", model_id: "anthropic/claude-5-sonnet", display_name: "Claude Sonnet 5 (via OpenRouter)", desc: "Accès à Claude Sonnet 5 via OpenRouter.", vision: 1, thinking: 1, flagship: 1, speed: "fast", cost: "standard", ctx: "200k tokens" },
    { provider: "openrouter", model_id: "openai/gpt-5", display_name: "OpenAI GPT-5 (via OpenRouter)", desc: "Accès à GPT-5 via OpenRouter.", vision: 1, thinking: 1, flagship: 1, speed: "fast", cost: "premium", ctx: "256k tokens" },
    { provider: "openrouter", model_id: "deepseek/deepseek-chat", display_name: "DeepSeek V3 (via OpenRouter)", desc: "Modèle open-weights ultra-performant et économique.", vision: 0, thinking: 0, flagship: 1, speed: "fast", cost: "eco", ctx: "64k tokens" },
    { provider: "openrouter", model_id: "deepseek/deepseek-r1", display_name: "DeepSeek R1 (Raisonnement via OpenRouter)", desc: "Modèle de raisonnement avec chaîne de pensée.", vision: 0, thinking: 1, flagship: 1, speed: "deep", cost: "eco", ctx: "64k tokens" },
    // Cloudflare Workers AI (Free Tier 10k neurones/jour natif 0€)
    {
      provider: "cloudflare",
      model_id: "@cf/meta/llama-3.1-8b-instruct-fp8",
      display_name: "Meta Llama 3.1 8B FP8 (Cloudflare Workers AI - 0€)",
      desc: "Modèle ultrarapide hébergé nativement sur GPUs Cloudflare. 10 000 neurones/jour offerts. Idéal battlecards et pitchs commerciaux instantanés.",
      vision: 0,
      thinking: 0,
      flagship: 1,
      speed: "ultra",
      cost: "eco",
      ctx: "128k tokens",
    },
    {
      provider: "cloudflare",
      model_id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      display_name: "Meta Llama 3.3 70B Fast (Cloudflare Workers AI)",
      desc: "Flagship open-weights Meta sur GPUs Cloudflare. Puissance rédactionnelle maximale.",
      vision: 0,
      thinking: 0,
      flagship: 1,
      speed: "fast",
      cost: "standard",
      ctx: "128k tokens",
    },
    {
      provider: "cloudflare",
      model_id: "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
      display_name: "DeepSeek R1 32B (Cloudflare Workers AI)",
      desc: "Raisonnement stratégique avec chaîne de pensée sur GPUs Cloudflare.",
      vision: 0,
      thinking: 1,
      flagship: 1,
      speed: "deep",
      cost: "standard",
      ctx: "64k tokens",
    },
  ];

  for (const m of baseModels) {
    await c.env.DB.prepare(
      `INSERT INTO available_models (provider, model_id, display_name, description, supports_vision, supports_thinking, is_flagship, speed, cost_tier, context_window, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
       ON CONFLICT(provider, model_id) DO UPDATE SET
         display_name = excluded.display_name,
         description = excluded.description,
         is_flagship = excluded.is_flagship,
         speed = excluded.speed,
         cost_tier = excluded.cost_tier,
         context_window = excluded.context_window,
         updated_at = excluded.updated_at`,
    )
      .bind(m.provider, m.model_id, m.display_name, m.desc, m.vision, m.thinking, m.flagship, m.speed, m.cost, m.ctx, now)
      .run()
      .catch(() => undefined);
  }

  const apiKey = c.env.GEMINI_API_KEY;
  if (apiKey) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        const data = (await res.json()) as { models?: { name: string; displayName?: string; description?: string; supportedGenerationMethods?: string[] }[] };
        const geminiModels = (data.models || []).filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"));
        for (const m of geminiModels) {
          const modelId = m.name.replace(/^models\//, "");
          if (modelId.startsWith("gemini-1.0") || modelId.includes("-tuning") || /-\d{3}$/.test(modelId)) continue;
          const isPro = modelId.includes("pro");
          const isThinking = modelId.includes("thinking") || isPro;
          const isFlagship =
            modelId === "gemini-3.8-flash" ||
            modelId === "gemini-3.1-pro-preview" ||
            modelId === "gemini-3-flash-preview" ||
            modelId === "gemini-flash-latest" ||
            modelId === "gemini-pro-latest";

          await c.env.DB.prepare(
            `INSERT INTO available_models (provider, model_id, display_name, description, supports_vision, supports_thinking, is_flagship, speed, cost_tier, context_window, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
             ON CONFLICT(provider, model_id) DO UPDATE SET
               display_name = excluded.display_name,
               description = excluded.description,
               is_flagship = excluded.is_flagship,
               speed = excluded.speed,
               cost_tier = excluded.cost_tier,
               context_window = excluded.context_window,
               updated_at = excluded.updated_at`,
          )
            .bind(
              "gemini",
              modelId,
              m.displayName || modelId,
              m.description?.slice(0, 150) || null,
              1,
              isThinking ? 1 : 0,
              isFlagship ? 1 : 0,
              isPro ? "deep" : "ultra",
              isPro ? "standard" : "eco",
              isPro ? "2M tokens" : "1M tokens",
              now,
            )
            .run()
            .catch(() => undefined);
        }
      }
    } catch {
      // Timeout ou échec réseau
    }
  }

  const allAvailable = await listAvailableModels(c.env.DB);
  return c.json({ ok: true, count: allAvailable.length });
});

/** POST /api/worker/models/sync — le worker local pousse les modèles détectés. */
adminRoutes.post("/api/worker/models/sync", async (c) => {
  if (!bearerMatches(c.req.header("Authorization"), c.env.SYNC_SECRET_TOKEN)) return c.json({ error: "unauthorized" }, 401);
  const b = await c.req.json<{ models?: import("../types").AvailableModel[] }>().catch(() => ({}) as { models?: import("../types").AvailableModel[] });
  if (!b.models || !Array.isArray(b.models)) return c.json({ error: "invalid_payload" }, 400);

  const now = new Date().toISOString();
  for (const m of b.models) {
    await c.env.DB.prepare(
      `INSERT INTO available_models (provider, model_id, display_name, description, supports_vision, supports_thinking, is_flagship, speed, cost_tier, context_window, recommended_for, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
       ON CONFLICT(provider, model_id) DO UPDATE SET
         display_name = excluded.display_name,
         description = excluded.description,
         is_flagship = excluded.is_flagship,
         speed = excluded.speed,
         cost_tier = excluded.cost_tier,
         context_window = excluded.context_window,
         recommended_for = excluded.recommended_for,
         updated_at = excluded.updated_at`,
    )
      .bind(
        m.provider,
        m.model_id,
        m.display_name,
        m.description || null,
        m.supports_vision ?? 1,
        m.supports_thinking ?? 0,
        m.is_flagship ?? 1,
        m.speed ?? "fast",
        m.cost_tier ?? "eco",
        m.context_window ?? "1M tokens",
        m.recommended_for ?? "all",
        now,
      )
      .run()
      .catch(() => undefined);
  }
  return c.json({ ok: true, count: b.models.length });
});

/** POST /api/admin/models — met à jour la configuration des modèles. */
adminRoutes.post("/api/admin/models", requireUser("admin"), async (c) => {
  const b = await c.req.json<{ settings?: ModelSettingRow[] }>().catch(() => ({}) as { settings?: ModelSettingRow[] });
  if (!b.settings || !Array.isArray(b.settings)) return c.json({ error: "invalid_payload" }, 400);

  const stmts: D1PreparedStatement[] = [];
  const now = new Date().toISOString();
  for (const s of b.settings) {
    if (!["demo", "audit", "battlecard"].includes(s.action_type) || !s.provider || !s.model) continue;
    stmts.push(
      c.env.DB.prepare(
        `INSERT INTO model_settings (action_type, provider, model, thinking_budget, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(action_type) DO UPDATE SET
           provider = excluded.provider,
           model = excluded.model,
           thinking_budget = excluded.thinking_budget,
           updated_at = excluded.updated_at`,
      ).bind(s.action_type, s.provider, s.model.trim(), s.thinking_budget || 0, now),
    );
  }
  if (stmts.length) await c.env.DB.batch(stmts);
  return c.json({ ok: true });
});

export async function listModelSettings(db: D1Database): Promise<ModelSettingRow[]> {
  const r = await db.prepare("SELECT * FROM model_settings").all<ModelSettingRow>();
  return r.results;
}

export async function listAvailableModels(db: D1Database): Promise<import("../types").AvailableModel[]> {
  const r = await db.prepare("SELECT * FROM available_models ORDER BY provider, id").all<import("../types").AvailableModel>();
  return r.results;
}

export interface TokenUsageRow {
  model: string;
  input: number;
  output: number;
  thinking: number;
  totalCalls: number;
  inputToday: number;
  outputToday: number;
  callsToday: number;
  estimatedCostEur: number;
  estimatedNeuronsToday: number;
  quotaCategory: "cloudflare_free" | "gemini_free_tier" | "paid" | "cli_0euro";
}

export interface QuotaCockpit {
  safetyStatus: "safe" | "warning" | "danger";
  safetyMessage: string;
  totalCostEstimateEur: number;
  cloudflareNeuronsToday: number;
  cloudflareDailyQuota: number;
  cloudflareUsedPercent: number;
  canContinueSafely: boolean;
}

export interface AdminStats {
  byStatus: { status: string; n: number }[];
  total: number;
  won: number;
  tokens: TokenUsageRow[];
  quotas: QuotaCockpit;
}

export function computeTokenMetrics(rawList: Array<{
  model: string;
  input: number;
  output: number;
  thinking: number;
  total_calls: number;
  input_today: number;
  output_today: number;
  calls_today: number;
}>): { tokens: TokenUsageRow[]; quotas: QuotaCockpit } {
  let totalCostEstimateEur = 0;
  let cloudflareNeuronsToday = 0;

  const tokens: TokenUsageRow[] = rawList.map((r) => {
    const m = r.model.toLowerCase();
    let cost = 0;
    let neuronsToday = 0;
    let quotaCat: TokenUsageRow["quotaCategory"] = "paid";

    if (m.startsWith("@cf/") || m.includes("cloudflare")) {
      quotaCat = "cloudflare_free";
      const rate = m.includes("70b") ? 250 : 25;
      neuronsToday = Math.round(((r.input_today + r.output_today) / 1000) * rate);
      // Seule la part de dépassement apportée par ce modèle lui est imputée (sinon double comptage entre modèles @cf).
      const overBefore = Math.max(0, cloudflareNeuronsToday - 10000);
      cloudflareNeuronsToday += neuronsToday;
      const overAfter = Math.max(0, cloudflareNeuronsToday - 10000);
      cost = ((overAfter - overBefore) / 1000) * 0.011 * 0.92;
    } else if (m.includes("antigravity") || m.includes("cli")) {
      quotaCat = "cli_0euro";
      cost = 0;
    } else if (m.includes("flash")) {
      quotaCat = "gemini_free_tier";
      if (r.calls_today > 1500) {
        cost = (r.input / 1_000_000) * 0.075 * 0.92 + (r.output / 1_000_000) * 0.30 * 0.92;
      }
    } else if (m.includes("pro")) {
      quotaCat = "paid";
      cost = (r.input / 1_000_000) * 1.25 * 0.92 + (r.output / 1_000_000) * 5.00 * 0.92;
    } else if (m.includes("claude")) {
      quotaCat = "paid";
      cost = (r.input / 1_000_000) * 3.00 * 0.92 + (r.output / 1_000_000) * 15.00 * 0.92;
    } else if (m.includes("gpt-4") || m.includes("gpt-5")) {
      quotaCat = "paid";
      cost = (r.input / 1_000_000) * 2.50 * 0.92 + (r.output / 1_000_000) * 10.00 * 0.92;
    }

    totalCostEstimateEur += cost;

    return {
      model: r.model,
      input: r.input,
      output: r.output,
      thinking: r.thinking,
      totalCalls: r.total_calls,
      inputToday: r.input_today,
      outputToday: r.output_today,
      callsToday: r.calls_today,
      estimatedCostEur: Number(cost.toFixed(4)),
      estimatedNeuronsToday: neuronsToday,
      quotaCategory: quotaCat,
    };
  });

  const cloudflareDailyQuota = 10000;
  const cloudflareUsedPercent = Math.min(100, Math.round((cloudflareNeuronsToday / cloudflareDailyQuota) * 100));

  let safetyStatus: "safe" | "warning" | "danger" = "safe";
  let safetyMessage = "Feu vert : vos appels sont 100% gratuits et sous les quotas.";
  let canContinueSafely = true;

  if (totalCostEstimateEur > 0 || cloudflareUsedPercent >= 90) {
    safetyStatus = "danger";
    safetyMessage = "Attention facturation : Quota gratuit dépassé ou modèle payant utilisé. Basculez en mode CLI 0€ !";
    canContinueSafely = false;
  } else if (cloudflareUsedPercent >= 70) {
    safetyStatus = "warning";
    safetyMessage = "Attention : Vous avez consommé plus de 70% du quota quotidien gratuit Cloudflare.";
  }

  return {
    tokens,
    quotas: {
      safetyStatus,
      safetyMessage,
      totalCostEstimateEur: Number(totalCostEstimateEur.toFixed(2)),
      cloudflareNeuronsToday,
      cloudflareDailyQuota,
      cloudflareUsedPercent,
      canContinueSafely,
    },
  };
}

export async function loadStats(db: D1Database): Promise<AdminStats> {
  const byStatus = await db.prepare("SELECT status, COUNT(*) AS n FROM leads GROUP BY status").all<{ status: string; n: number }>();
  const rawTokens = await db
    .prepare(
      `SELECT model,
              SUM(input_tokens) AS input,
              SUM(output_tokens) AS output,
              SUM(thinking_tokens) AS thinking,
              COUNT(*) AS total_calls,
              SUM(CASE WHEN created_at >= date('now', 'start of day') THEN input_tokens ELSE 0 END) AS input_today,
              SUM(CASE WHEN created_at >= date('now', 'start of day') THEN output_tokens ELSE 0 END) AS output_today,
              SUM(CASE WHEN created_at >= date('now', 'start of day') THEN 1 ELSE 0 END) AS calls_today
       FROM token_usage
       GROUP BY model`,
    )
    .all<{
      model: string;
      input: number;
      output: number;
      thinking: number;
      total_calls: number;
      input_today: number;
      output_today: number;
      calls_today: number;
    }>();

  const total = byStatus.results.reduce((s, r) => s + r.n, 0);
  const won = byStatus.results.find((r) => r.status === "won")?.n ?? 0;
  const { tokens, quotas } = computeTokenMetrics(rawTokens.results);
  return { byStatus: byStatus.results, total, won, tokens, quotas };
}

adminRoutes.get("/api/admin/stats", requireUser("admin"), async (c) => c.json(await loadStats(c.env.DB)));

/** POST /api/admin/models/circuit-breaker — coupe immédiatement toutes les API pour forcer le mode CLI 0€ */
adminRoutes.post("/api/admin/models/circuit-breaker", requireUser("admin"), async (c) => {
  await c.env.DB.prepare(
    "UPDATE model_settings SET provider = 'cli', model = 'antigravity-0euro', thinking_budget = 0",
  ).run();
  return c.json({ ok: true, message: "Coupe-circuit activé : toutes les actions sont basculées en mode CLI 0€." });
});
