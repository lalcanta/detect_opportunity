import { loadConfig, type Config } from "./config";
import { ModelRouter } from "./llm/modelRouter";
import { runScan } from "./scanRunner";
import { runPrepScan } from "./prepScan";
import { log, sleep } from "./utils/helpers";

/**
 * Worker : interroge le dashboard toutes les POLL_MS ms, exécute les scans demandés depuis l'interface admin
 * et remonte la progression. Aucun port entrant à ouvrir sur le Mac.
 */
const POLL_MS = 10_000;

interface RemoteJob {
  id: number;
  query: string;
  city: string;
  lead_limit: number;
  use_cdp: number;
  lat?: number | null;
  lng?: number | null;
  radius_km?: number | null;
  opportunity_type?: string;
  website_filter?: "all" | "no_website" | "has_website";
  execution_mode?: "full_auto" | "prep_only";
}

async function api<T>(cfg: Config, path: string, body?: unknown, method: "GET" | "POST" = "POST"): Promise<T> {
  const res = await fetch(`${cfg.REMOTE_APP_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.SYNC_SECRET_TOKEN}` },
    body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${path}`);
  return (await res.json()) as T;
}

async function handleJob(cfg: Config, router: ModelRouter, job: RemoteJob): Promise<void> {
  // Coupe-circuit 0 € actif : un job "full_auto" est exécuté en préparation seule (aucun appel API).
  const forcedPrep = job.execution_mode !== "prep_only" && router.isZeroCostMode();
  const isPrep = job.execution_mode === "prep_only" || forcedPrep;
  log(
    "worker",
    `Job #${job.id} [${isPrep ? "Préparation CLI 0€" : "Cycle Complet"}${forcedPrep ? " — forcé par le coupe-circuit" : ""}] : ${job.query} / ${job.city} (limite ${job.lead_limit}${job.use_cdp ? ", CDP" : ""})`,
  );
  const report = (b: Record<string, unknown>): Promise<{ cancel?: boolean }> =>
    api<{ cancel?: boolean }>(cfg, `/api/worker/jobs/${job.id}/progress`, b);

  try {
    if (isPrep) {
      const result = await runPrepScan(
        {
          query: job.query,
          city: job.city,
          limit: job.lead_limit,
          cdp: job.use_cdp === 1,
          lat: job.lat,
          lng: job.lng,
          radius_km: job.radius_km,
          opportunity_type: job.opportunity_type,
          website_filter: job.website_filter,
        },
        {
          onProgress: async (processed, total, message) => {
            const r = await report({ status: "running", processed, total, message, log_entry: message }).catch(() => ({ cancel: false }));
            return r.cancel ? false : undefined;
          },
        },
      );
      if (!result.cancelled) {
        await report({
          status: "done",
          processed: result.processed,
          total: result.total,
          message: `${result.processed}/${result.total} leads préparés dans queue/pending/ (prêts pour Antigravity CLI 0€)`,
          log_entry: `🎉 Scan terminé : ${result.processed}/${result.total} leads préparés en local.`,
        });
      }
      return;
    }

    const result = await runScan(
      {
        query: job.query,
        city: job.city,
        limit: job.lead_limit,
        cdp: job.use_cdp === 1,
        lat: job.lat,
        lng: job.lng,
        radius_km: job.radius_km,
        opportunity_type: job.opportunity_type,
        website_filter: job.website_filter,
        dryRun: false,
      },
      cfg,
      router,
      {
        onProgress: async (processed, total, message) => {
          const r = await report({ status: "running", processed, total, message, log_entry: message }).catch(() => ({ cancel: false }));
          return r.cancel ? false : undefined;
        },
      },
    );
    if (!result.cancelled) {
      await report({
        status: "done",
        processed: result.processed,
        total: result.total,
        message: `${result.processed}/${result.total} leads qualifiés synchronisés dans le CRM`,
        log_entry: `🎉 Scan terminé : ${result.processed}/${result.total} leads qualifiés synchronisés dans le CRM.`,
      });
    }
  } catch (err) {
    log("worker", `Job #${job.id} en échec : ${(err as Error).message}`);
    await report({ status: "failed", message: (err as Error).message, log_entry: `❌ Erreur critique : ${(err as Error).message}` }).catch(() => undefined);
  }
}

async function syncDiscoveredModels(cfg: Config): Promise<void> {
  const models: {
    provider: string;
    model_id: string;
    display_name: string;
    description?: string;
    supports_vision: number;
    supports_thinking: number;
    is_flagship?: number;
    speed?: string;
    cost_tier?: string;
    context_window?: string;
    recommended_for?: string;
  }[] = [];

  // 1. Modèles Anthropic (Génération Claude 5 / 5.5 et archives)
  models.push(
    {
      provider: "anthropic",
      model_id: "claude-5-5-opus",
      display_name: "Claude Opus 5.5 (Code d'élite & Raisonnement)",
      description: "Modèle le plus puissant d'Anthropic pour les architectures complexes et le code Tailwind sans faille.",
      supports_vision: 1,
      supports_thinking: 1,
      is_flagship: 1,
      speed: "deep",
      cost_tier: "premium",
      context_window: "200k tokens",
      recommended_for: "demo",
    },
    {
      provider: "anthropic",
      model_id: "claude-5-sonnet",
      display_name: "Claude Sonnet 5 (Top Design & Frontend)",
      description: "Modèle de référence pour la refonte visuelle des sites web, réactivité et esthétique moderne.",
      supports_vision: 1,
      supports_thinking: 1,
      is_flagship: 1,
      speed: "fast",
      cost_tier: "standard",
      context_window: "200k tokens",
      recommended_for: "demo",
    },
    {
      provider: "anthropic",
      model_id: "claude-5-haiku",
      display_name: "Claude Haiku 5 (Ultra-rapide)",
      description: "Modèle ultra-rapide pour l'audit technique et la génération instantanée de scripts.",
      supports_vision: 1,
      supports_thinking: 0,
      is_flagship: 1,
      speed: "ultra",
      cost_tier: "eco",
      context_window: "200k tokens",
      recommended_for: "audit,battlecard",
    },
    {
      provider: "anthropic",
      model_id: "claude-3-7-sonnet-20250219",
      display_name: "Claude 3.7 Sonnet (Précédente génération)",
      description: "Ancienne version de Sonnet (génération 3.7).",
      supports_vision: 1,
      supports_thinking: 1,
      is_flagship: 0,
      speed: "fast",
      cost_tier: "standard",
      context_window: "200k tokens",
    },
    {
      provider: "anthropic",
      model_id: "claude-3-5-haiku-20241022",
      display_name: "Claude 3.5 Haiku (Archive)",
      description: "Ancienne version de Haiku (génération 3.5).",
      supports_vision: 1,
      supports_thinking: 0,
      is_flagship: 0,
      speed: "ultra",
      cost_tier: "eco",
      context_window: "200k tokens",
    },
  );

  // 2. Modèles OpenAI (Génération GPT-5, o3 et archives)
  models.push(
    {
      provider: "openai",
      model_id: "gpt-5",
      display_name: "OpenAI GPT-5 (Flagship Multimodal)",
      description: "Modèle de pointe d'OpenAI avec compréhension visuelle avancée et écriture commerciale percutante.",
      supports_vision: 1,
      supports_thinking: 1,
      is_flagship: 1,
      speed: "fast",
      cost_tier: "premium",
      context_window: "256k tokens",
      recommended_for: "demo,battlecard",
    },
    {
      provider: "openai",
      model_id: "gpt-5-mini",
      display_name: "OpenAI GPT-5 Mini (Rapide & Économique)",
      description: "Version condensée de GPT-5, idéale pour l'analyse technique rapide et les audits de masse.",
      supports_vision: 1,
      supports_thinking: 0,
      is_flagship: 1,
      speed: "ultra",
      cost_tier: "eco",
      context_window: "128k tokens",
      recommended_for: "audit",
    },
    {
      provider: "openai",
      model_id: "o3",
      display_name: "OpenAI o3 (Raisonnement Approfondi)",
      description: "Modèle de réflexion poussée pour les diagnostics complexes et l'optimisation logique.",
      supports_vision: 1,
      supports_thinking: 1,
      is_flagship: 1,
      speed: "deep",
      cost_tier: "premium",
      context_window: "200k tokens",
      recommended_for: "audit",
    },
    {
      provider: "openai",
      model_id: "o3-mini",
      display_name: "OpenAI o3-mini (Thinking Économique)",
      description: "Modèle de raisonnement avec coût maîtrisé et latence modérée.",
      supports_vision: 0,
      supports_thinking: 1,
      is_flagship: 1,
      speed: "deep",
      cost_tier: "eco",
      context_window: "128k tokens",
      recommended_for: "battlecard",
    },
    {
      provider: "openai",
      model_id: "gpt-4o",
      display_name: "OpenAI GPT-4o (Précédente génération)",
      description: "Modèle polyvalent GPT-4o.",
      supports_vision: 1,
      supports_thinking: 0,
      is_flagship: 0,
      speed: "fast",
      cost_tier: "standard",
      context_window: "128k tokens",
    },
    {
      provider: "openai",
      model_id: "gpt-4o-mini",
      display_name: "OpenAI GPT-4o Mini (Archive)",
      description: "Modèle compact GPT-4o mini.",
      supports_vision: 1,
      supports_thinking: 0,
      is_flagship: 0,
      speed: "ultra",
      cost_tier: "eco",
      context_window: "128k tokens",
    },
  );

  // 3. Modèles OpenRouter & DeepSeek
  models.push(
    {
      provider: "openrouter",
      model_id: "anthropic/claude-5-sonnet",
      display_name: "Claude Sonnet 5 (via OpenRouter)",
      description: "Accès à Claude Sonnet 5 via OpenRouter.",
      supports_vision: 1,
      supports_thinking: 1,
      is_flagship: 1,
      speed: "fast",
      cost_tier: "standard",
      context_window: "200k tokens",
    },
    {
      provider: "openrouter",
      model_id: "openai/gpt-5",
      display_name: "OpenAI GPT-5 (via OpenRouter)",
      description: "Accès à GPT-5 via OpenRouter.",
      supports_vision: 1,
      supports_thinking: 1,
      is_flagship: 1,
      speed: "fast",
      cost_tier: "premium",
      context_window: "256k tokens",
    },
    {
      provider: "openrouter",
      model_id: "deepseek/deepseek-chat",
      display_name: "DeepSeek V3 (via OpenRouter)",
      description: "Modèle open-weights ultra-performant à coût minime.",
      supports_vision: 0,
      supports_thinking: 0,
      is_flagship: 1,
      speed: "fast",
      cost_tier: "eco",
      context_window: "64k tokens",
      recommended_for: "battlecard",
    },
    {
      provider: "openrouter",
      model_id: "deepseek/deepseek-r1",
      display_name: "DeepSeek R1 (Raisonnement via OpenRouter)",
      description: "Modèle de raisonnement open-weights avec chaîne de pensée.",
      supports_vision: 0,
      supports_thinking: 1,
      is_flagship: 1,
      speed: "deep",
      cost_tier: "eco",
      context_window: "64k tokens",
      recommended_for: "audit",
    },
    // 3. bis Cloudflare Workers AI (Free Tier 10k neurones/jour natif)
    {
      provider: "cloudflare",
      model_id: "@cf/meta/llama-3.1-8b-instruct-fp8",
      display_name: "Meta Llama 3.1 8B FP8 (Cloudflare Workers AI - 0€)",
      description: "Modèle ultrarapide hébergé nativement sur Cloudflare. 10 000 neurones/jour offerts. Idéal battlecards et pitchs commerciaux instantanés.",
      supports_vision: 0,
      supports_thinking: 0,
      is_flagship: 1,
      speed: "ultra",
      cost_tier: "eco",
      context_window: "128k tokens",
      recommended_for: "battlecard,audit",
    },
    {
      provider: "cloudflare",
      model_id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      display_name: "Meta Llama 3.3 70B Fast (Cloudflare Workers AI)",
      description: "Flagship open-weights Meta sur GPUs Cloudflare. Puissance rédactionnelle maximale.",
      supports_vision: 0,
      supports_thinking: 0,
      is_flagship: 1,
      speed: "fast",
      cost_tier: "standard",
      context_window: "128k tokens",
      recommended_for: "battlecard,demo",
    },
    {
      provider: "cloudflare",
      model_id: "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
      display_name: "DeepSeek R1 32B (Cloudflare Workers AI)",
      description: "Raisonnement stratégique avec chaîne de pensée sur GPUs Cloudflare.",
      supports_vision: 0,
      supports_thinking: 1,
      is_flagship: 1,
      speed: "deep",
      cost_tier: "standard",
      context_window: "64k tokens",
      recommended_for: "audit",
    },
  );

  // 4. Découverte dynamique des modèles Google Gemini depuis l'API officielle
  if (cfg.GEMINI_API_KEY_1) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${cfg.GEMINI_API_KEY_1}`);
      if (res.ok) {
        const data = (await res.json()) as { models?: { name: string; displayName?: string; description?: string; supportedGenerationMethods?: string[] }[] };
        const geminiModels = (data.models || []).filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"));
        for (const m of geminiModels) {
          const modelId = m.name.replace(/^models\//, "");
          // Filtrer les versions legacy 1.0, les variantes tuning/custom et les snapshots datés -001, -002...
          if (modelId.startsWith("gemini-1.0") || modelId.includes("-tuning") || /-\d{3}$/.test(modelId)) {
            continue;
          }
          const isPro = modelId.includes("pro");
          const isThinking = modelId.includes("thinking") || isPro;
          // Flagships Gemini : Gemini 3.8 Flash, 3.1 Pro, 3 Flash, Flash Latest, Pro Latest
          const isFlagship =
            modelId === "gemini-3.8-flash" ||
            modelId === "gemini-3.1-pro-preview" ||
            modelId === "gemini-3-flash-preview" ||
            modelId === "gemini-flash-latest" ||
            modelId === "gemini-pro-latest";

          models.push({
            provider: "gemini",
            model_id: modelId,
            display_name: m.displayName || modelId,
            description: m.description?.slice(0, 150) || undefined,
            supports_vision: 1,
            supports_thinking: isThinking ? 1 : 0,
            is_flagship: isFlagship ? 1 : 0,
            speed: isPro ? "deep" : "ultra",
            cost_tier: isPro ? "standard" : "eco",
            context_window: isPro ? "2M tokens" : "1M tokens",
            recommended_for: isPro ? "demo" : "audit,battlecard",
          });
        }
      }
    } catch (err) {
      log("worker", `Erreur découverte modèles Gemini : ${(err as Error).message}`);
    }
  }

  if (models.length > 0) {
    await api(cfg, "/api/worker/models/sync", { models }).catch(() => undefined);
    log("worker", `✔ ${models.length} modèles synchronisés avec le dashboard`);
  }
}

interface RemoteScheduledScan {
  id: number;
  label: string;
  time_of_day: string;
  days_of_week: string;
  query: string;
  city: string;
  last_run_at?: string | null;
}

/**
 * Vérifie si une programmation doit être déclenchée à l'instant présent.
 * Compare l'heure courante (format HH:mm) et le jour de la semaine (1=Lundi..7=Dimanche)
 * tout en s'assurant qu'elle n'a pas déjà tourné dans la journée actuelle.
 */
export function shouldTriggerScheduledScan(sched: RemoteScheduledScan, now = new Date()): boolean {
  const currentHour = String(now.getHours()).padStart(2, "0");
  const currentMin = String(now.getMinutes()).padStart(2, "0");
  const currentTimeStr = `${currentHour}:${currentMin}`;

  // Jour ISO : 1 = Lundi, ..., 7 = Dimanche
  const day = now.getDay() === 0 ? 7 : now.getDay();
  const days = sched.days_of_week === "*" ? [1, 2, 3, 4, 5, 6, 7] : sched.days_of_week.split(",").map((x) => parseInt(x.trim(), 10));

  if (!days.includes(day)) return false;

  // L'heure prévue doit être atteinte (ou dans la fenêtre courante)
  if (currentTimeStr < sched.time_of_day) return false;

  // S'assure qu'elle n'a pas déjà été exécutée aujourd'hui
  if (sched.last_run_at) {
    const lastDate = new Date(sched.last_run_at);
    if (
      lastDate.getFullYear() === now.getFullYear() &&
      lastDate.getMonth() === now.getMonth() &&
      lastDate.getDate() === now.getDate()
    ) {
      return false;
    }
  }

  return true;
}

async function checkAndTriggerSchedules(cfg: Config): Promise<void> {
  try {
    const res = await api<{ scheduled: RemoteScheduledScan[] }>(cfg, "/api/worker/scheduled-scans", undefined, "GET");
    const now = new Date();
    for (const s of res.scheduled || []) {
      if (shouldTriggerScheduledScan(s, now)) {
        log("worker", `⏰ Déclenchement automatique de la programmation #${s.id} "${s.label}" (${s.time_of_day})`);
        await api(cfg, `/api/worker/scheduled-scans/${s.id}/trigger`, {}).catch((err: Error) =>
          log("worker", `⚠️ Déclenchement de la programmation #${s.id} échoué : ${err.message}`),
        );
      }
    }
  } catch (err) {
    // Non bloquant (réseau temporaire), mais journalisé : une erreur systématique doit rester visible.
    log("worker", `⚠️ Lecture des planifications échouée : ${(err as Error).message}`);
  }
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const router = new ModelRouter(cfg);
  log("worker", `En écoute des scans et planifications automatiques sur ${cfg.REMOTE_APP_URL} (Ctrl+C pour arrêter)`);

  // Synchronisation des modèles IA disponibles au démarrage
  await syncDiscoveredModels(cfg).catch(() => undefined);

  let lastScheduleCheck = 0;

  for (;;) {
    try {
      // Vérification des planifications récurrentes (toutes les 30s)
      if (Date.now() - lastScheduleCheck >= 30_000) {
        lastScheduleCheck = Date.now();
        await checkAndTriggerSchedules(cfg);
      }

      const res = await api<{
        job: RemoteJob | null;
        models?: { action_type: string; provider: string; model: string; thinking_budget?: number }[];
      }>(cfg, "/api/worker/claim");
      if (res.models && res.models.length > 0) {
        router.updateSettings(res.models);
      }
      if (res.job) {
        await handleJob(cfg, router, res.job);
        continue; // enchaîne directement sur le job suivant
      }
    } catch (err) {
      log("worker", `Dashboard injoignable : ${(err as Error).message}`);
    }
    await sleep(POLL_MS);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
