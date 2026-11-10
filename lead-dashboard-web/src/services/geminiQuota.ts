/**
 * Quotas gratuits Gemini du jour, calculés à partir de token_usage.
 * Google n'expose pas le quota restant d'une clé API AI Studio : on compte les appels enregistrés par l'outil
 * depuis minuit (heure du Pacifique) et on les compare aux limites de la console, modifiables dans l'admin.
 * Les appels faits ailleurs avec la même clé ne sont pas vus.
 */
import { GEMINI_FREE_TIER_DEFAULTS, geminiDayStart, geminiNextReset, toSqlTimestamp } from "../../../shared/llm/geminiQuotas";

export const MODEL_QUOTAS_DDL = `CREATE TABLE IF NOT EXISTS model_quotas (
  model       TEXT PRIMARY KEY,
  rpm         INTEGER,
  rpd         INTEGER NOT NULL,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;

export type QuotaState = "ok" | "warning" | "exhausted" | "no_free_tier" | "unknown";

export interface GeminiQuotaRow {
  model: string;
  callsToday: number;
  /** Limite par jour (null = inconnue). */
  rpd: number | null;
  rpm: number | null;
  /** Limite saisie dans l'admin plutôt que la valeur par défaut. */
  custom: boolean;
  percent: number;
  state: QuotaState;
  /** Actions qui utilisent ce modèle, en principal ou en secours (ex. « Démo », « Démo (secours 1) »). */
  usedBy: string[];
}

export interface GeminiQuotaSummary {
  rows: GeminiQuotaRow[];
  /** Début de la journée de quota, en UTC (format SQLite). */
  dayStart: string;
  /** Prochaine remise à zéro, ISO. */
  resetAt: string;
}

const LEGACY_FALLBACK = "gemini-3-flash-preview";

const ACTION_LABELS: Record<string, string> = { demo: "Démo", audit: "Audit", battlecard: "Battlecard" };

/** Nom de modèle Gemini d'une référence (« gemini:x », « x »), ou null si c'est un autre fournisseur. */
export function geminiModelOf(ref: string, provider?: string): string | null {
  const v = ref.trim();
  if (!v) return null;
  const m = v.match(/^(gemini|openai|anthropic|openrouter|cloudflare):(.+)$/);
  if (m) return m[1] === "gemini" ? m[2]!.trim() : null;
  if (provider) return provider === "gemini" ? v : null;
  return /^(gemini|gemma)/i.test(v) ? v : null;
}

function parseList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return raw.split(",");
  }
}

export function quotaState(calls: number, rpd: number | null): QuotaState {
  if (rpd === null) return "unknown";
  if (rpd === 0) return "no_free_tier";
  if (calls >= rpd) return "exhausted";
  if (calls >= rpd * 0.8) return "warning";
  return "ok";
}

export function buildGeminiQuotaRows(input: {
  settings: { action_type: string; provider: string; model: string; fallback_models?: string | null }[];
  overrides: { model: string; rpm: number | null; rpd: number }[];
  callsToday: { model: string; n: number }[];
}): GeminiQuotaRow[] {
  const usedBy = new Map<string, string[]>();
  const note = (model: string | null, label: string) => {
    if (!model) return;
    usedBy.set(model, [...(usedBy.get(model) ?? []), label]);
  };
  for (const s of input.settings) {
    const label = ACTION_LABELS[s.action_type] ?? s.action_type;
    note(geminiModelOf(s.model, s.provider), label);
    const fallbacks = parseList(s.fallback_models).filter((f) => f.trim());
    fallbacks.forEach((f, i) => note(geminiModelOf(f), `${label} (secours ${i + 1})`));
    // Sans secours configuré, le worker se replie sur gemini-3-flash-preview (LEGACY_FALLBACK de modelRouter.ts).
    if (!fallbacks.length && s.provider !== "cli" && s.model !== LEGACY_FALLBACK) note(LEGACY_FALLBACK, `${label} (secours par défaut)`);
  }
  const calls = new Map(input.callsToday.map((c) => [c.model, Number(c.n) || 0]));
  const overrides = new Map(input.overrides.map((o) => [o.model, o]));

  const models = new Set<string>([...usedBy.keys(), ...overrides.keys()]);
  for (const m of calls.keys()) if (geminiModelOf(m)) models.add(m);

  const rows = [...models].map((model): GeminiQuotaRow => {
    const o = overrides.get(model);
    const def = GEMINI_FREE_TIER_DEFAULTS[model];
    const rpd = o ? o.rpd : def ? def.rpd : null;
    const rpm = o ? o.rpm : def ? def.rpm : null;
    const n = calls.get(model) ?? 0;
    return {
      model,
      callsToday: n,
      rpd,
      rpm,
      custom: Boolean(o),
      percent: rpd ? Math.min(100, Math.round((n / rpd) * 100)) : 0,
      state: quotaState(n, rpd),
      usedBy: usedBy.get(model) ?? [],
    };
  });
  // Modèles utilisés par une action d'abord, puis les plus consommés.
  return rows.sort((a, b) => Number(b.usedBy.length > 0) - Number(a.usedBy.length > 0) || b.callsToday - a.callsToday || a.model.localeCompare(b.model));
}

export async function loadGeminiQuotas(db: D1Database, now: number = Date.now()): Promise<GeminiQuotaSummary> {
  const dayStart = toSqlTimestamp(geminiDayStart(now));
  const [settings, overrides, calls] = await Promise.all([
    db.prepare("SELECT action_type, provider, model, fallback_models FROM model_settings").all<{ action_type: string; provider: string; model: string; fallback_models: string | null }>(),
    db.prepare("SELECT model, rpm, rpd FROM model_quotas").all<{ model: string; rpm: number | null; rpd: number }>().catch(() => ({ results: [] })),
    db.prepare("SELECT model, COUNT(*) AS n FROM token_usage WHERE created_at >= ? GROUP BY model").bind(dayStart).all<{ model: string; n: number }>(),
  ]);
  return {
    rows: buildGeminiQuotaRows({ settings: settings.results, overrides: overrides.results, callsToday: calls.results }),
    dayStart,
    resetAt: new Date(geminiNextReset(now)).toISOString(),
  };
}

/** Valide une limite saisie dans l'admin : entier ≥ 0, ou null pour revenir à la valeur par défaut. */
export function parseQuotaLimit(raw: unknown): number | null | "invalid" {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 10_000_000 ? n : "invalid";
}
