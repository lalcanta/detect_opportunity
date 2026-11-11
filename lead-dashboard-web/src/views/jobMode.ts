import type { ScanJob } from "../routes/scans";

const BADGE = "px-2 py-0.5 rounded text-[11px] font-semibold border";

/**
 * Badge du mode d'un job : demandé, et réellement exécuté quand le worker l'a remonté.
 * Un job demandé en Full Auto mais exécuté en préparation (coupe-circuit 0 €) est signalé.
 */
export function jobModeBadge(s: Pick<ScanJob, "execution_mode" | "job_type" | "effective_mode">): string {
  if (s.job_type === "generate") {
    return `<span class="${BADGE} bg-violet-50 text-violet-700 border-violet-200" title="Génération par API des leads préparés (queue/pending du Mac)">🤖 Génération API</span>`;
  }
  if (s.execution_mode !== "prep_only" && s.effective_mode === "prep_only") {
    return `<span class="${BADGE} bg-amber-50 text-amber-800 border-amber-300" title="Demandé en Cycle Complet, exécuté en préparation locale : le coupe-circuit 0 € était actif. Les leads attendent l'agent ou « Générer via l'API ».">🛠️ CLI 0€ <span class="font-normal">(forcé)</span></span>`;
  }
  if (s.execution_mode === "prep_only") {
    return `<span class="${BADGE} bg-indigo-50 text-indigo-700 border-indigo-200" title="Préparation locale dans queue/pending/ sans coût API">🛠️ CLI 0€</span>`;
  }
  return `<span class="${BADGE} bg-emerald-50 text-emerald-700 border-emerald-200" title="Cycle complet avec clés API et synchronisation CRM">⚡ Full Auto</span>`;
}
