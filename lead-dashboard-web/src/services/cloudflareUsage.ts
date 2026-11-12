/**
 * Consommation Cloudflare du compte, comparée aux plafonds du forfait gratuit, pour l'onglet admin « Quotas & Coûts ».
 *
 * Sources : API GraphQL Analytics (requêtes Pages Functions, D1, Workers AI, R2) et API REST (builds Pages, forfait).
 * Les plafonds ne sont pas exposés par l'API : ils sont écrits ici (`FREE_LIMITS`). Les quotas journaliers de
 * Cloudflare se remettent à zéro à minuit UTC, d'où les dates UTC.
 *
 * Exige les secrets `CF_API_TOKEN` (jeton en lecture seule : Account Analytics, D1, Pages, R2 ; Billing facultatif)
 * et `CF_ACCOUNT_ID`. Résultat gardé 10 minutes en mémoire par isolat.
 */

const API = "https://api.cloudflare.com/client/v4";
const CACHE_MS = 10 * 60 * 1000;
const HISTORY_DAYS = 30;

/** Plafonds du forfait gratuit (Workers Free), à mettre à jour si Cloudflare les change. */
export const FREE_LIMITS = {
  requestsPerDay: 100_000,
  aiNeuronsPerDay: 10_000,
  d1RowsReadPerDay: 5_000_000,
  d1RowsWrittenPerDay: 100_000,
  d1StorageBytes: 5 * 1024 ** 3,
  pagesBuildsPerMonth: 500,
  r2StorageBytes: 10 * 1024 ** 3,
  r2ClassAPerMonth: 1_000_000,
  r2ClassBPerMonth: 10_000_000,
} as const;

/** Opérations R2 de classe A (écritures, listes) ; les suppressions sont gratuites, le reste est en classe B. */
const R2_CLASS_A = new Set([
  "ListBuckets",
  "PutBucket",
  "ListObjects",
  "PutObject",
  "CopyObject",
  "CompleteMultipartUpload",
  "CreateMultipartUpload",
  "LifecycleStorageTierTransition",
  "ListMultipartUploads",
  "UploadPart",
  "UploadPartCopy",
  "ListParts",
  "PutBucketEncryption",
  "PutBucketCors",
  "PutBucketLifecycleConfiguration",
]);
const R2_FREE_OPS = new Set(["DeleteObject", "DeleteBucket", "AbortMultipartUpload"]);

export interface UsagePoint {
  date: string;
  value: number;
}

export interface UsageMetric {
  id: string;
  service: string;
  label: string;
  /** `count` ou `bytes`, pour l'affichage. */
  unit: "count" | "bytes";
  /** Période du plafond : jour UTC, mois civil, ou volume stocké. */
  period: "day" | "month" | "stored";
  value: number;
  limit: number;
  history: UsagePoint[];
  note?: string;
}

export interface CloudflareUsage {
  configured: boolean;
  error?: string;
  fetchedAt?: string;
  /** `free`, `paid` (Workers Paid détecté) ou `unknown` si le jeton ne lit pas la facturation. */
  plan?: "free" | "paid" | "unknown";
  today?: string;
  metrics?: UsageMetric[];
  aiModelsToday?: Array<{ model: string; neurons: number; calls: number }>;
  r2Buckets?: Array<{ name: string; bytes: number; objects: number }>;
  partialErrors?: string[];
}

interface Env {
  CF_API_TOKEN?: string;
  CF_ACCOUNT_ID?: string;
}

let cache: { at: number; data: CloudflareUsage } | null = null;

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

function lastDays(n: number, end = new Date()): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(isoDate(new Date(end.getTime() - i * 86_400_000)));
  return out;
}

function fillHistory(days: string[], byDate: Map<string, number>): UsagePoint[] {
  return days.map((date) => ({ date, value: byDate.get(date) ?? 0 }));
}

function addTo(map: Map<string, number>, key: string, n: number): void {
  map.set(key, (map.get(key) ?? 0) + n);
}

async function cfFetch<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`réponse illisible (${res.status})`);
  }
  if (!res.ok || body?.success === false || (Array.isArray(body?.errors) && body.errors.length && !body.data)) {
    const msg = body?.errors?.[0]?.message ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return body as T;
}

const ANALYTICS_QUERY = `query Usage($account: string!, $from: Date!, $to: Date!, $fromTime: Time!, $toTime: Time!, $monthTime: Time!) {
  viewer {
    accounts(filter: { accountTag: $account }) {
      pages: pagesFunctionsInvocationsAdaptiveGroups(limit: 2000, filter: { date_geq: $from, date_leq: $to }) {
        sum { requests }
        dimensions { date }
      }
      workers: workersInvocationsAdaptive(limit: 2000, filter: { date_geq: $from, date_leq: $to }) {
        sum { requests }
        dimensions { date }
      }
      d1: d1AnalyticsAdaptiveGroups(limit: 2000, filter: { date_geq: $from, date_leq: $to }) {
        sum { rowsRead rowsWritten }
        dimensions { date }
      }
      d1Storage: d1StorageAdaptiveGroups(limit: 2000, filter: { date_geq: $from, date_leq: $to }) {
        max { databaseSizeBytes }
        dimensions { date databaseId }
      }
      ai: aiInferenceAdaptiveGroups(limit: 2000, filter: { datetime_geq: $fromTime, datetime_leq: $toTime }) {
        sum { totalNeurons }
        count
        dimensions { date modelId }
      }
      r2Storage: r2StorageAdaptiveGroups(limit: 2000, filter: { datetime_geq: $fromTime, datetime_leq: $toTime }) {
        max { payloadSize metadataSize objectCount }
        dimensions { date bucketName }
      }
      r2Ops: r2OperationsAdaptiveGroups(limit: 2000, filter: { datetime_geq: $monthTime, datetime_leq: $toTime }) {
        sum { requests }
        dimensions { date actionType }
      }
    }
  }
}`;

interface AnalyticsData {
  pages: Array<{ sum: { requests: number }; dimensions: { date: string } }>;
  workers: Array<{ sum: { requests: number }; dimensions: { date: string } }>;
  d1: Array<{ sum: { rowsRead: number; rowsWritten: number }; dimensions: { date: string } }>;
  d1Storage: Array<{ max: { databaseSizeBytes: number }; dimensions: { date: string; databaseId: string } }>;
  ai: Array<{ sum: { totalNeurons: number }; count: number; dimensions: { date: string; modelId: string } }>;
  r2Storage: Array<{ max: { payloadSize: number; metadataSize: number; objectCount: number }; dimensions: { date: string; bucketName: string } }>;
  r2Ops: Array<{ sum: { requests: number }; dimensions: { date: string; actionType: string } }>;
}

/** Nombre de builds Pages (tous projets) par jour, depuis `since`. */
async function pagesBuilds(token: string, account: string, since: string): Promise<Map<string, number>> {
  const byDate = new Map<string, number>();
  const projects = await cfFetch<{ result: Array<{ name: string }> }>(token, `/accounts/${account}/pages/projects`);
  for (const p of projects.result ?? []) {
    for (let page = 1; page <= 20; page++) {
      const res = await cfFetch<{ result: Array<{ created_on: string }> }>(
        token,
        `/accounts/${account}/pages/projects/${encodeURIComponent(p.name)}/deployments?page=${page}&per_page=25`,
      );
      const list = res.result ?? [];
      let older = false;
      for (const d of list) {
        const day = d.created_on.slice(0, 10);
        if (day < since) older = true;
        else addTo(byDate, day, 1);
      }
      if (older || list.length < 25) break;
    }
  }
  return byDate;
}

async function detectPlan(token: string, account: string): Promise<"free" | "paid" | "unknown"> {
  try {
    const res = await cfFetch<{ result: Array<{ rate_plan?: { id?: string; public_name?: string }; state?: string }> }>(
      token,
      `/accounts/${account}/subscriptions`,
    );
    const paid = (res.result ?? []).some((s) => /workers/i.test(`${s.rate_plan?.id ?? ""} ${s.rate_plan?.public_name ?? ""}`) && s.state !== "Cancelled");
    return paid ? "paid" : "free";
  } catch {
    return "unknown";
  }
}

export async function getCloudflareUsage(env: Env, opts: { refresh?: boolean } = {}): Promise<CloudflareUsage> {
  if (!env.CF_API_TOKEN || !env.CF_ACCOUNT_ID) return { configured: false };
  if (!opts.refresh && cache && Date.now() - cache.at < CACHE_MS) return cache.data;

  const token = env.CF_API_TOKEN;
  const account = env.CF_ACCOUNT_ID;
  const now = new Date();
  const days = lastDays(HISTORY_DAYS, now);
  const today = days[days.length - 1]!;
  const monthStart = `${today.slice(0, 7)}-01`;
  const partialErrors: string[] = [];

  let a: AnalyticsData;
  try {
    const res = await cfFetch<{ data: { viewer: { accounts: AnalyticsData[] } }; errors?: Array<{ message: string }> }>(token, "/graphql", {
      method: "POST",
      body: JSON.stringify({
        query: ANALYTICS_QUERY,
        variables: {
          account,
          from: days[0],
          to: today,
          fromTime: `${days[0]}T00:00:00Z`,
          toTime: now.toISOString().replace(/\.\d+Z$/, "Z"),
          monthTime: `${monthStart}T00:00:00Z`,
        },
      }),
    });
    if (res.errors?.length) partialErrors.push(...res.errors.map((e) => e.message));
    const acc = res.data?.viewer?.accounts?.[0];
    if (!acc) throw new Error(res.errors?.[0]?.message ?? "compte introuvable : vérifiez CF_ACCOUNT_ID et les droits du jeton");
    a = acc;
  } catch (e) {
    return { configured: true, error: `API Cloudflare : ${(e as Error).message}` };
  }

  const [builds, plan] = await Promise.all([
    pagesBuilds(token, account, monthStart).catch((e: Error) => {
      partialErrors.push(`builds Pages : ${e.message}`);
      return null;
    }),
    detectPlan(token, account),
  ]);

  // Requêtes : Pages Functions et Workers partagent le plafond journalier.
  const requests = new Map<string, number>();
  for (const g of a.pages ?? []) addTo(requests, g.dimensions.date, g.sum.requests);
  for (const g of a.workers ?? []) addTo(requests, g.dimensions.date, g.sum.requests);

  const rowsRead = new Map<string, number>();
  const rowsWritten = new Map<string, number>();
  for (const g of a.d1 ?? []) {
    addTo(rowsRead, g.dimensions.date, g.sum.rowsRead);
    addTo(rowsWritten, g.dimensions.date, g.sum.rowsWritten);
  }

  // Stockage D1 : taille de chaque base au dernier relevé de chaque jour, sommée sur le compte.
  const d1Size = new Map<string, Map<string, number>>();
  for (const g of a.d1Storage ?? []) {
    const perDb = d1Size.get(g.dimensions.date) ?? new Map<string, number>();
    perDb.set(g.dimensions.databaseId, Math.max(perDb.get(g.dimensions.databaseId) ?? 0, g.max.databaseSizeBytes));
    d1Size.set(g.dimensions.date, perDb);
  }
  const d1Storage = carryForward(days, d1Size);

  const neurons = new Map<string, number>();
  const models = new Map<string, { neurons: number; calls: number }>();
  for (const g of a.ai ?? []) {
    addTo(neurons, g.dimensions.date, g.sum.totalNeurons);
    if (g.dimensions.date === today) {
      const m = models.get(g.dimensions.modelId) ?? { neurons: 0, calls: 0 };
      m.neurons += g.sum.totalNeurons;
      m.calls += g.count;
      models.set(g.dimensions.modelId, m);
    }
  }

  const r2Size = new Map<string, Map<string, number>>();
  const lastBucket = new Map<string, { date: string; bytes: number; objects: number }>();
  for (const g of a.r2Storage ?? []) {
    const bytes = g.max.payloadSize + g.max.metadataSize;
    const perBucket = r2Size.get(g.dimensions.date) ?? new Map<string, number>();
    perBucket.set(g.dimensions.bucketName, Math.max(perBucket.get(g.dimensions.bucketName) ?? 0, bytes));
    r2Size.set(g.dimensions.date, perBucket);
    const prev = lastBucket.get(g.dimensions.bucketName);
    if (!prev || g.dimensions.date >= prev.date) lastBucket.set(g.dimensions.bucketName, { date: g.dimensions.date, bytes, objects: g.max.objectCount });
  }
  const r2Storage = carryForward(days, r2Size);

  const classA = new Map<string, number>();
  const classB = new Map<string, number>();
  for (const g of a.r2Ops ?? []) {
    const t = g.dimensions.actionType;
    if (R2_FREE_OPS.has(t)) continue;
    addTo(R2_CLASS_A.has(t) ? classA : classB, g.dimensions.date, g.sum.requests);
  }

  const monthDays = days.filter((d) => d >= monthStart);
  const monthSum = (m: Map<string, number>) => monthDays.reduce((s, d) => s + (m.get(d) ?? 0), 0);
  const cumulative = (m: Map<string, number>): UsagePoint[] => {
    let s = 0;
    return monthDays.map((date) => ({ date, value: (s += m.get(date) ?? 0) }));
  };

  const metrics: UsageMetric[] = [
    {
      id: "requests",
      service: "Pages Functions et Workers",
      label: "Requêtes",
      unit: "count",
      period: "day",
      value: requests.get(today) ?? 0,
      limit: FREE_LIMITS.requestsPerDay,
      history: fillHistory(days, requests),
      note: "Tout le compte : dashboard, interrogations du worker, autres projets.",
    },
    {
      id: "ai_neurons",
      service: "Workers AI",
      label: "Neurones",
      unit: "count",
      period: "day",
      value: Math.round(neurons.get(today) ?? 0),
      limit: FREE_LIMITS.aiNeuronsPerDay,
      history: fillHistory(days, neurons).map((p) => ({ ...p, value: Math.round(p.value) })),
      note: "Au-delà, les appels échouent jusqu'à minuit UTC (forfait gratuit).",
    },
    {
      id: "d1_rows_read",
      service: "D1",
      label: "Lignes lues",
      unit: "count",
      period: "day",
      value: rowsRead.get(today) ?? 0,
      limit: FREE_LIMITS.d1RowsReadPerDay,
      history: fillHistory(days, rowsRead),
    },
    {
      id: "d1_rows_written",
      service: "D1",
      label: "Lignes écrites",
      unit: "count",
      period: "day",
      value: rowsWritten.get(today) ?? 0,
      limit: FREE_LIMITS.d1RowsWrittenPerDay,
      history: fillHistory(days, rowsWritten),
    },
    {
      id: "d1_storage",
      service: "D1",
      label: "Stockage",
      unit: "bytes",
      period: "stored",
      value: d1Storage[d1Storage.length - 1]?.value ?? 0,
      limit: FREE_LIMITS.d1StorageBytes,
      history: d1Storage,
    },
  ];
  if (builds) {
    metrics.push({
      id: "pages_builds",
      service: "Pages",
      label: "Builds",
      unit: "count",
      period: "month",
      value: monthSum(builds),
      limit: FREE_LIMITS.pagesBuildsPerMonth,
      history: cumulative(builds),
      note: "Un build par push sur une branche suivie.",
    });
  }
  metrics.push(
    {
      id: "r2_storage",
      service: "R2",
      label: "Stockage",
      unit: "bytes",
      period: "stored",
      value: r2Storage[r2Storage.length - 1]?.value ?? 0,
      limit: FREE_LIMITS.r2StorageBytes,
      history: r2Storage,
    },
    {
      id: "r2_class_a",
      service: "R2",
      label: "Opérations classe A",
      unit: "count",
      period: "month",
      value: monthSum(classA),
      limit: FREE_LIMITS.r2ClassAPerMonth,
      history: cumulative(classA),
      note: "Écritures et listes.",
    },
    {
      id: "r2_class_b",
      service: "R2",
      label: "Opérations classe B",
      unit: "count",
      period: "month",
      value: monthSum(classB),
      limit: FREE_LIMITS.r2ClassBPerMonth,
      history: cumulative(classB),
      note: "Lectures.",
    },
  );

  const data: CloudflareUsage = {
    configured: true,
    fetchedAt: now.toISOString(),
    plan,
    today,
    metrics,
    aiModelsToday: [...models.entries()]
      .map(([model, m]) => ({ model, neurons: Math.round(m.neurons), calls: m.calls }))
      .sort((x, y) => y.neurons - x.neurons),
    r2Buckets: [...lastBucket.entries()]
      .map(([name, b]) => ({ name, bytes: b.bytes, objects: b.objects }))
      .sort((x, y) => y.bytes - x.bytes),
    ...(partialErrors.length ? { partialErrors } : {}),
  };
  cache = { at: Date.now(), data };
  return data;
}

/** Somme par jour des volumes stockés ; un jour sans relevé reprend la dernière valeur connue de chaque élément. */
function carryForward(days: string[], byDate: Map<string, Map<string, number>>): UsagePoint[] {
  const last = new Map<string, number>();
  return days.map((date) => {
    for (const [k, v] of byDate.get(date) ?? []) last.set(k, v);
    let total = 0;
    for (const v of last.values()) total += v;
    return { date, value: total };
  });
}
