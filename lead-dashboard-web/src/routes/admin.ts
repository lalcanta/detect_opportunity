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
      : '["website","audit_qa_trackers","google_reviews","seo_local","ads_acquisition","custom"]';

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

export interface AdminStats {
  byStatus: { status: string; n: number }[];
  total: number;
  won: number;
  tokens: { model: string; input: number; output: number; thinking: number }[];
}

export async function loadStats(db: D1Database): Promise<AdminStats> {
  const byStatus = await db.prepare("SELECT status, COUNT(*) AS n FROM leads GROUP BY status").all<{ status: string; n: number }>();
  const tokens = await db
    .prepare(
      `SELECT model, SUM(input_tokens) AS input, SUM(output_tokens) AS output, SUM(thinking_tokens) AS thinking
       FROM token_usage GROUP BY model`,
    )
    .all<{ model: string; input: number; output: number; thinking: number }>();
  const total = byStatus.results.reduce((s, r) => s + r.n, 0);
  const won = byStatus.results.find((r) => r.status === "won")?.n ?? 0;
  return { byStatus: byStatus.results, total, won, tokens: tokens.results };
}

adminRoutes.get("/api/admin/stats", requireUser("admin"), async (c) => c.json(await loadStats(c.env.DB)));
