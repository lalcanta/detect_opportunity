import { spawn } from "node:child_process";
import { assertKnownOptions } from "./utils/cliArgs";
import { loadConfig, type Config } from "./config";
import { ModelRouter } from "./llm/modelRouter";
import { runScan } from "./scanRunner";
import { runPrepScan } from "./prepScan";
import { generateQueuedLeadsViaApi } from "./generateQueue";
import { log, sleep } from "./utils/helpers";
import { applyRemoteOpportunities } from "./opportunities/remote";
import { runEmailLoop } from "./outreach/emailWorker";
import { smtpSender, smtpSettingsFrom } from "./outreach/smtpSender";

/**
 * Worker : interroge le dashboard toutes les POLL_MS ms, exécute les scans demandés depuis l'interface admin
 * et remonte la progression. Aucun port entrant à ouvrir sur le Mac.
 */
const POLL_MS = 10_000;
/** Battement envoyé au CRM pendant un job, même sans progression (sinon le CRM le déclare mort après 10 min). */
export const HEARTBEAT_MS = 60_000;

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
  /** "scan" (Maps + inspection) ou "generate" (génération par API de leads déjà préparés). */
  job_type?: "scan" | "generate";
  /** Leads à générer, en JSON (job "generate"). */
  lead_ids?: string | null;
}

/** Mode réellement exécuté par le worker, remonté au dashboard (diffère du mode demandé si le coupe-circuit 0 € force la préparation). */
export function effectiveModeOf(job: Pick<RemoteJob, "execution_mode" | "job_type">, zeroCost: boolean): "full_auto" | "prep_only" | "api_generation" {
  if (job.job_type === "generate") return "api_generation";
  return job.execution_mode === "prep_only" || zeroCost ? "prep_only" : "full_auto";
}

export function parseLeadIds(raw: string | null | undefined): string[] {
  try {
    const list = JSON.parse(raw || "[]");
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string" && /^[\w-]{1,64}$/.test(x)) : [];
  } catch {
    return [];
  }
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

async function handleGenerateJob(cfg: Config, router: ModelRouter, job: RemoteJob, report: (b: Record<string, unknown>) => Promise<{ cancel?: boolean }>): Promise<void> {
  const ids = parseLeadIds(job.lead_ids);
  log("worker", `Job #${job.id} [Génération API] : ${ids.length} lead(s) de la file`);
  if (!ids.length) {
    await report({ status: "failed", message: "Aucun lead à générer", log_entry: "❌ Aucun lead valide dans le job." });
    return;
  }
  const result = await generateQueuedLeadsViaApi(ids, cfg, router, {
    onProgress: async (processed, total, message) => {
      const r = await report({ status: "running", processed, total, message, log_entry: message }).catch(() => ({ cancel: false }));
      return r.cancel ? false : undefined;
    },
  });
  if (result.cancelled) return;
  const failed = result.failures.length ? ` · ${result.failures.length} échec(s) : ${result.failures.map((f) => `${f.id.slice(0, 8)} (${f.reason})`).join(" ; ")}` : "";
  await report({
    status: result.processed === 0 && result.failures.length ? "failed" : "done",
    processed: result.processed,
    total: result.total,
    message: `${result.processed}/${result.total} lead(s) générés par API et synchronisés${failed}`.slice(0, 500),
    log_entry: `🎉 Génération API terminée : ${result.processed}/${result.total} synchronisé(s)${failed}`,
  });
}

/** Exécute `run` en envoyant un battement toutes les HEARTBEAT_MS ; la minuterie s'arrête à la fin, succès ou erreur. */
export async function withHeartbeat<T>(beat: () => Promise<unknown>, run: () => Promise<T>, everyMs = HEARTBEAT_MS): Promise<T> {
  const timer = setInterval(() => void beat().catch(() => undefined), everyMs);
  try {
    return await run();
  } finally {
    clearInterval(timer);
  }
}

/** Processus qui empêche la veille ; `stop` le termine. */
export interface SleepGuard {
  stop(): void;
}

/**
 * Empêche la mise en veille du Mac pendant un job (`caffeinate -i` : l'écran peut s'éteindre, la machine reste
 * éveillée). Ailleurs que sur macOS, ou si `caffeinate` est introuvable, ne fait rien.
 */
export function preventSleep(platform: string = process.platform, start = (cmd: string, args: string[]) => spawn(cmd, args, { stdio: "ignore" })): SleepGuard {
  if (platform !== "darwin") return { stop: () => undefined };
  try {
    const child = start("caffeinate", ["-i", "-w", String(process.pid)]);
    child.on("error", () => undefined);
    return { stop: () => void child.kill() };
  } catch {
    return { stop: () => undefined };
  }
}

/** Exécute `run` sans que le Mac se mette en veille ; la protection est levée à la fin, succès ou erreur. */
export async function withoutSleep<T>(run: () => Promise<T>, guard: () => SleepGuard = preventSleep): Promise<T> {
  const g = guard();
  try {
    return await run();
  } finally {
    g.stop();
  }
}

async function handleJob(cfg: Config, router: ModelRouter, job: RemoteJob): Promise<void> {
  const report = (b: Record<string, unknown>): Promise<{ cancel?: boolean }> =>
    api<{ cancel?: boolean }>(cfg, `/api/worker/jobs/${job.id}/progress`, b);
  // Le battement n'envoie aucun statut : il ne met à jour que heartbeat_at. Si le CRM répond `cancel` (job annulé ou déclaré mort),
  // le prochain rapport de progression le renverra aussi et le scan s'arrête.
  // Pas de veille pendant le job : un Mac endormi ferait déclarer le job mort au bout de 10 minutes.
  await withoutSleep(() => withHeartbeat(() => report({}), () => runJob(cfg, router, job, report)));
}

async function runJob(cfg: Config, router: ModelRouter, job: RemoteJob, report: (b: Record<string, unknown>) => Promise<{ cancel?: boolean }>): Promise<void> {
  const effectiveMode = effectiveModeOf(job, router.isZeroCostMode());

  if (effectiveMode === "api_generation") {
    await report({ status: "running", effective_mode: effectiveMode }).catch(() => undefined);
    try {
      await handleGenerateJob(cfg, router, job, report);
    } catch (err) {
      log("worker", `Job #${job.id} en échec : ${(err as Error).message}`);
      await report({ status: "failed", message: (err as Error).message, log_entry: `❌ ${(err as Error).message}` }).catch(() => undefined);
    }
    return;
  }

  // Coupe-circuit 0 € actif : un job "full_auto" est exécuté en préparation seule (aucun appel API).
  const isPrep = effectiveMode === "prep_only";
  const forcedPrep = isPrep && job.execution_mode !== "prep_only";
  log(
    "worker",
    `Job #${job.id} [${isPrep ? "Préparation CLI 0€" : "Cycle Complet"}${forcedPrep ? " — forcé par le coupe-circuit" : ""}] : ${job.query} / ${job.city} (limite ${job.lead_limit}${job.use_cdp ? ", CDP" : ""})`,
  );
  await report({
    status: "running",
    effective_mode: effectiveMode,
    log_entry: forcedPrep ? "⚠️ Coupe-circuit 0 € actif : job demandé en Cycle Complet, exécuté en préparation (file locale pour l'agent)." : undefined,
  }).catch(() => undefined);

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
          message: `${result.processed}/${result.total} leads préparés dans queue/pending/ (prêts pour l'agent, ou « Générer via l'API » dans la file)${forcedPrep ? " — préparation forcée par le coupe-circuit 0 €" : ""}`,
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

/** Fuseau d'évaluation des planifications : l'heure saisie dans le CRM est une heure de Paris, quel que soit le Mac. */
export const SCHEDULE_TIMEZONE = "Europe/Paris";
/** Un passage n'est lancé que dans les 2 h qui suivent `time_of_day` ; au-delà il est sauté pour la journée. */
export const SCHEDULE_WINDOW_MINUTES = 120;

const parisFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: SCHEDULE_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Date, jour ISO (1=lundi..7=dimanche) et minutes depuis minuit d'un instant, en heure de Paris. */
function parisParts(d: Date): { date: string; isoDay: number; minutes: number } {
  const p: Record<string, string> = {};
  for (const part of parisFormat.formatToParts(d)) p[part.type] = part.value;
  const isoDay = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(p.weekday ?? "") + 1;
  return { date: `${p.year}-${p.month}-${p.day}`, isoDay, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

/** `last_run_at` est un ISO UTC (écrit par le CRM) ; une ancienne valeur D1 « YYYY-MM-DD HH:MM:SS » est aussi en UTC. */
function parseStoredDate(value: string): Date | null {
  const iso = /(Z|[+-]\d\d:?\d\d)$/.test(value) ? value : `${value.replace(" ", "T")}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export type ScheduleDecision = "due" | "wrong_day" | "invalid_time" | "too_early" | "window_missed" | "already_ran";

/**
 * Décide si une planification doit être déclenchée à `now`, en heure de Paris :
 * jour coché (1=lundi..7=dimanche ou `*`), heure atteinte, au plus 2 h après `time_of_day`,
 * et pas déjà lancée par le planificateur le même jour de Paris.
 * Limite : la fenêtre ne passe pas minuit. Un passage prévu à 22:00 ou plus n'a que le temps restant dans la
 * journée de Paris (22:00 -> 23:59), car après minuit c'est un autre jour. Un `time_of_day` vide ou illisible
 * refuse la planification (`invalid_time`).
 */
export function scheduleDecision(sched: RemoteScheduledScan, now = new Date()): ScheduleDecision {
  const cur = parisParts(now);
  const days = sched.days_of_week.trim() === "*" ? [1, 2, 3, 4, 5, 6, 7] : sched.days_of_week.split(",").map((x) => parseInt(x.trim(), 10));
  if (!days.includes(cur.isoDay)) return "wrong_day";

  const match = /^(\d{1,2}):(\d{2})$/.exec((sched.time_of_day ?? "").trim());
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return "invalid_time";
  const planned = Number(match[1]) * 60 + Number(match[2]);
  if (cur.minutes < planned) return "too_early";

  if (sched.last_run_at) {
    const last = parseStoredDate(sched.last_run_at);
    if (last && parisParts(last).date === cur.date) return "already_ran";
  }
  if (cur.minutes >= planned + SCHEDULE_WINDOW_MINUTES) return "window_missed";
  return "due";
}

export function isScheduleDue(sched: RemoteScheduledScan, now = new Date()): boolean {
  return scheduleDecision(sched, now) === "due";
}

/** Passages sautés déjà journalisés (planification + jour de Paris), pour ne pas répéter la ligne toutes les 30 s. */
const skippedLogged = new Set<string>();

/** Ligne de log d'un passage refusé ou sauté, une seule fois par planification et par jour de Paris ; sinon null. */
export function skipLogLine(s: RemoteScheduledScan, decision: ScheduleDecision, now: Date): string | null {
  if (decision !== "window_missed" && decision !== "invalid_time") return null;
  const key = `${s.id}@${decision}@${now.toLocaleDateString("en-CA", { timeZone: SCHEDULE_TIMEZONE })}`;
  if (skippedLogged.has(key)) return null;
  skippedLogged.add(key);
  return decision === "invalid_time"
    ? `⚠️ Programmation #${s.id} "${s.label}" ignorée : heure illisible (« ${s.time_of_day ?? ""} »), attendu HH:mm`
    : `⏭️ Programmation #${s.id} "${s.label}" sautée aujourd'hui : fenêtre de ${SCHEDULE_WINDOW_MINUTES / 60} h après ${s.time_of_day} dépassée`;
}

async function checkAndTriggerSchedules(cfg: Config): Promise<void> {
  try {
    const res = await api<{ scheduled: RemoteScheduledScan[] }>(cfg, "/api/worker/scheduled-scans", undefined, "GET");
    const now = new Date();
    for (const s of res.scheduled || []) {
      const decision = scheduleDecision(s, now);
      const skipLine = skipLogLine(s, decision, now);
      if (skipLine) {
        log("worker", skipLine);
      } else if (decision === "due") {
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

/**
 * Boucle des planifications, indépendante de celle des jobs : un scan long ne retarde pas la vérification
 * (déclencher ne fait que créer un job en file via `/trigger`). Les erreurs sont journalisées sans casser la boucle.
 */
export async function runScheduleLoop(check: () => Promise<void>, intervalMs = 30_000, shouldStop: () => boolean = () => false): Promise<void> {
  while (!shouldStop()) {
    try {
      await check();
    } catch (err) {
      log("worker", `⚠️ Vérification des planifications échouée : ${(err as Error).message}`);
    }
    await sleep(intervalMs);
  }
}

async function main(): Promise<void> {
  assertKnownOptions({});
  const cfg = loadConfig();
  const router = new ModelRouter(cfg);
  log("worker", `En écoute des scans et planifications automatiques sur ${cfg.REMOTE_APP_URL} (Ctrl+C pour arrêter)`);

  // Synchronisation des modèles IA disponibles au démarrage
  await syncDiscoveredModels(cfg).catch(() => undefined);

  // Envoi des emails mis en file par les closers (adapter SMTP), à côté des scans.
  const smtp = smtpSettingsFrom(process.env);
  if (smtp) {
    log("worker", `✉️ Envoi SMTP actif (${smtp.host}:${smtp.port})`);
    void runEmailLoop(<T>(path: string, body?: unknown) => api<T>(cfg, path, body), [smtpSender(smtp)]);
  }

  // Planifications récurrentes : boucle propre (toutes les 30 s), non bloquée par un scan en cours.
  void runScheduleLoop(() => checkAndTriggerSchedules(cfg));

  for (;;) {
    try {
      const res = await api<{
        job: RemoteJob | null;
        models?: { action_type: string; provider: string; model: string; thinking_budget?: number }[];
        opportunities?: unknown[];
      }>(cfg, "/api/worker/claim");
      if (res.models && res.models.length > 0) {
        router.updateSettings(res.models);
      }
      // Besoins édités dans le dashboard : appliqués avant de traiter le job.
      applyRemoteOpportunities(res.opportunities);
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

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
