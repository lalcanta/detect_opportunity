/** Santé des jobs du worker : détection des jobs morts et limite des logs (docs/AUDIT_2026-11.md §2.3). */

/** Délai sans battement du worker au-delà duquel un job `running` est considéré comme mort. */
export const STALE_JOB_MS = 10 * 60 * 1000;
/** Nombre de lignes de logs conservées par job. */
export const MAX_LOG_LINES = 300;
export const STALE_JOB_MESSAGE = "Interrompu : le worker ne répond plus (Mac en veille ou arrêté)";

/** Les dates D1 (`CURRENT_TIMESTAMP`) n'ont pas de fuseau : on les lit en UTC. */
function parseDate(value: string): number {
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value.replace(" ", "T")}Z`;
  return Date.parse(iso);
}

/** Vrai si le job est `running` et que son dernier signe de vie (battement, sinon démarrage) a plus de 10 minutes. */
export function isStaleJob(job: { status: string; heartbeat_at?: string | null; started_at?: string | null }, now: Date): boolean {
  if (job.status !== "running") return false;
  const last = job.heartbeat_at ?? job.started_at;
  if (!last) return false;
  const t = parseDate(last);
  return Number.isFinite(t) && now.getTime() - t > STALE_JOB_MS;
}

/**
 * Expression SQL (paramètre ?5 = nouvelle ligne) : ajoute la ligne à `logs` et ne garde que les MAX_LOG_LINES dernières.
 * Utilisée dans l'UPDATE de progression : l'ajout reste atomique, sans lecture préalable.
 */
export const APPEND_LOG_SQL = `WITH RECURSIVE joined(v) AS (
    SELECT CASE WHEN logs IS NULL OR logs = '' THEN ?5 ELSE logs || char(10) || ?5 END
  ), cut(s, n) AS (
    SELECT v, MAX(0, length(v) - length(replace(v, char(10), '')) + 1 - ${MAX_LOG_LINES}) FROM joined
    UNION ALL
    SELECT substr(s, instr(s, char(10)) + 1), n - 1 FROM cut WHERE n > 0
  ) SELECT s FROM cut WHERE n = 0`;

/** Passe en `failed` les jobs `running` sans signe de vie depuis plus de 10 minutes (même règle que `isStaleJob`). */
export async function failStaleJobs(db: D1Database, now: Date = new Date()): Promise<void> {
  const limit = new Date(now.getTime() - STALE_JOB_MS).toISOString();
  await db
    .prepare(
      `UPDATE scan_jobs SET status = 'failed', finished_at = ?1, message = ?2
       WHERE status = 'running' AND datetime(COALESCE(heartbeat_at, started_at)) < datetime(?3)`,
    )
    .bind(now.toISOString(), STALE_JOB_MESSAGE, limit)
    .run();
}
