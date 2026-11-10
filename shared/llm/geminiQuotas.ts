/**
 * Quotas gratuits de l'API Gemini (clé AI Studio), partagés entre le worker et le dashboard.
 *
 * Google n'expose pas le quota restant d'une clé API : le dashboard compte les appels enregistrés
 * dans token_usage et les compare à ces limites, et le worker lit le détail des erreurs 429
 * pour savoir si c'est la limite par minute ou par jour qui est atteinte.
 * Les limites par jour se remettent à zéro à minuit, heure du Pacifique.
 */

export interface GeminiLimits {
  /** Requêtes par minute. */
  rpm: number;
  /** Requêtes par jour (0 = pas de palier gratuit). */
  rpd: number;
}

/** Valeurs relevées dans la console AI Studio (novembre 2026), modifiables dans l'admin. */
export const GEMINI_FREE_TIER_DEFAULTS: Record<string, GeminiLimits> = {
  "gemini-3.5-flash-lite": { rpm: 15, rpd: 500 },
  "gemini-3.1-flash-lite": { rpm: 15, rpd: 500 },
  "gemini-3.1-flash-lite-preview": { rpm: 15, rpd: 500 },
  "gemini-2.5-flash-lite": { rpm: 10, rpd: 20 },
  "gemini-3-flash-preview": { rpm: 5, rpd: 20 },
  "gemini-3.6-flash": { rpm: 5, rpd: 20 },
  "gemini-3.8-flash": { rpm: 5, rpd: 20 },
  "gemini-2.5-flash": { rpm: 5, rpd: 20 },
  "gemma-4-26b-a4b-it": { rpm: 30, rpd: 14_400 },
  "gemma-4-31b-it": { rpm: 30, rpd: 14_400 },
  "gemini-2.5-pro": { rpm: 0, rpd: 0 },
  "gemini-3.1-pro-preview": { rpm: 0, rpd: 0 },
  "gemini-4-argon": { rpm: 0, rpd: 0 },
  "gemini-4-carbon": { rpm: 0, rpd: 0 },
};

const PACIFIC = "America/Los_Angeles";

function pacificParts(t: number): { y: number; m: number; d: number; h: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(t));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour") };
}

/** Instant (ms UTC) du dernier minuit, heure du Pacifique : début de la journée de quota Gemini. */
export function geminiDayStart(now: number = Date.now()): number {
  const { y, m, d } = pacificParts(now);
  // 08:00 UTC = minuit en heure d'hiver (UTC-8), 01:00 en heure d'été (UTC-7).
  const guess = Date.UTC(y, m - 1, d, 8);
  return guess - pacificParts(guess).h * 3_600_000;
}

/** Instant (ms UTC) de la prochaine remise à zéro des quotas par jour. */
export function geminiNextReset(now: number = Date.now()): number {
  // 26 h plus tard tombe toujours le lendemain (Pacifique), y compris les jours de 23 h ou 25 h.
  return geminiDayStart(geminiDayStart(now) + 26 * 3_600_000);
}

/** Format de CURRENT_TIMESTAMP dans SQLite : "YYYY-MM-DD HH:MM:SS" (UTC). */
export function toSqlTimestamp(t: number): string {
  return new Date(t).toISOString().slice(0, 19).replace("T", " ");
}

export interface GeminiQuotaError {
  /** Quelle limite est atteinte, si Google le précise. */
  scope: "day" | "minute" | "unknown";
  /** Délai conseillé par Google (RetryInfo.retryDelay), en ms. */
  retryMs: number | null;
  /** Identifiant du quota (ex. GenerateRequestsPerDayPerProjectPerModel-FreeTier). */
  quotaId: string | null;
  /** Limite annoncée par Google pour ce quota. */
  limit: number | null;
}

/**
 * Lit une erreur 429 RESOURCE_EXHAUSTED de l'API Gemini (détails QuotaFailure et RetryInfo).
 * Le SDK met le corps JSON de la réponse dans le message de l'erreur ; renvoie null si ce n'est pas une erreur de quota.
 */
export function parseGeminiQuotaError(err: unknown): GeminiQuotaError | null {
  const e = err as { status?: number; code?: number; message?: string } | null;
  const message = typeof e?.message === "string" ? e.message : String(err ?? "");
  const isQuota = e?.status === 429 || e?.code === 429 || /\b429\b|RESOURCE_EXHAUSTED/.test(message);
  if (!isQuota) return null;

  let details: unknown[] = [];
  const start = message.indexOf("{");
  if (start >= 0) {
    try {
      const body = JSON.parse(message.slice(start)) as { error?: { details?: unknown[] } };
      details = Array.isArray(body.error?.details) ? body.error.details : [];
    } catch {
      details = [];
    }
  }

  let quotaId: string | null = null;
  let limit: number | null = null;
  let retryMs: number | null = null;
  for (const raw of details) {
    const d = raw as { "@type"?: string; violations?: { quotaId?: string; quotaValue?: string }[]; retryDelay?: string };
    const type = d["@type"] ?? "";
    if (type.endsWith("QuotaFailure")) {
      const violations = d.violations ?? [];
      // Une limite par jour l'emporte : elle bloque plus longtemps.
      const v = violations.find((x) => /PerDay/i.test(x.quotaId ?? "")) ?? violations[0];
      if (v?.quotaId) quotaId = v.quotaId;
      if (v?.quotaValue && Number.isFinite(Number(v.quotaValue))) limit = Number(v.quotaValue);
    } else if (type.endsWith("RetryInfo") && typeof d.retryDelay === "string") {
      const s = Number.parseFloat(d.retryDelay);
      if (Number.isFinite(s)) retryMs = Math.round(s * 1000);
    }
  }

  // Sans détails, on retombe sur les champs texte (quotaId en clair dans certains messages).
  const idSource = quotaId ?? message;
  const scope = /PerDay/i.test(idSource) ? "day" : /PerMinute/i.test(idSource) ? "minute" : "unknown";
  return { scope, retryMs, quotaId, limit };
}

/** Durée de pause d'un modèle après une erreur de quota. */
export function quotaCooldownMs(q: GeminiQuotaError, now: number = Date.now(), fallbackMs = 60_000): number {
  if (q.scope === "day") return Math.max(fallbackMs, geminiNextReset(now) - now);
  return Math.max(1_000, q.retryMs ?? fallbackMs);
}
