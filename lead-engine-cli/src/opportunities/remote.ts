/**
 * Définitions des besoins éditées dans le dashboard (onglet admin « Besoins ») : le worker les reçoit avec chaque job,
 * les commandes lancées à la main (prep, sync-queue) les demandent au démarrage. Sans réponse du dashboard, les
 * définitions du code restent en vigueur.
 */
import { setOpportunityDefinitions } from "../../../shared/opportunities";
import type { Config } from "../config";
import { log } from "../utils/helpers";

/** Installe les définitions reçues ; journalise celles qui sont refusées. Renvoie le nombre chargé. */
export function applyRemoteOpportunities(list: unknown): number {
  if (!Array.isArray(list) || list.length === 0) return 0;
  const { loaded, errors } = setOpportunityDefinitions(list);
  for (const [id, errs] of Object.entries(errors)) log("besoins", `définition « ${id} » ignorée : ${errs.join(" ; ")}`);
  return loaded;
}

export async function loadRemoteOpportunities(cfg: Pick<Config, "REMOTE_APP_URL" | "SYNC_SECRET_TOKEN">): Promise<number> {
  try {
    const res = await fetch(`${cfg.REMOTE_APP_URL}/api/worker/opportunities`, {
      headers: { Authorization: `Bearer ${cfg.SYNC_SECRET_TOKEN}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { opportunities?: unknown };
    return applyRemoteOpportunities(data.opportunities);
  } catch (e) {
    log("besoins", `définitions du dashboard indisponibles (${(e as Error).message}) : définitions du code utilisées`);
    return 0;
  }
}
