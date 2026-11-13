/**
 * Carte « scan en direct » et lignes de la table des jobs de l'onglet Scanner : rendues au chargement de la page, puis
 * renvoyées telles quelles par `GET /api/admin/scans/live` pour l'actualisation sans rechargement.
 */
import type { ScanJob } from "../routes/scans";
import { opportunityBadgeMeta } from "./components";
import { jobModeBadge } from "./jobMode";
import { esc, icon } from "./layout";

const SCAN_STATUS_BADGE: Record<ScanJob["status"], string> = {
  queued: "bg-zinc-100 text-zinc-700",
  running: "bg-blue-100 text-blue-700 animate-pulse font-bold",
  done: "bg-emerald-100 text-emerald-800 font-bold",
  failed: "bg-rose-100 text-rose-800 font-bold",
  cancelled: "bg-amber-100 text-amber-800",
};

export const isActiveScan = (s: ScanJob): boolean => s.status === "queued" || s.status === "running";

/** Lignes du `<tbody id="scans_tbody">` de la table des jobs. */
export function renderScanRows(scans: ScanJob[]): string {
  if (!scans.length) return `<tr><td colspan="8" class="text-zinc-400 py-6 text-center">Aucun job de scan dans la file</td></tr>`;
  return scans
    .map((s) => {
      const o = opportunityBadgeMeta(s.opportunity_type);
      const filterTag = s.website_filter && s.website_filter !== "all" ? ` <span class="text-[9px] opacity-75">(${s.website_filter === "no_website" ? "sans site" : "avec site"})</span>` : "";
      const isGen = s.job_type === "generate";
      return `<tr class="hover:bg-zinc-50">
              <td class="py-3 font-mono font-bold text-zinc-400">${s.id}</td>
              <td class="py-3 font-semibold text-zinc-800">${esc(s.query)} · ${esc(s.city)}${isGen ? "" : ` <span class="text-xs text-zinc-400 font-normal">(${s.lead_limit} max${s.use_cdp ? ", CDP" : ""})</span>`}</td>
              <td class="py-3">${isGen ? '<span class="text-zinc-400">—</span>' : `<span class="px-2 py-0.5 rounded text-[11px] font-semibold border ${o.cls}">${o.label}${filterTag}</span>`}</td>
              <td class="py-3">${jobModeBadge(s)}</td>
              <td class="py-3"><span class="px-2.5 py-0.5 rounded-md text-xs font-semibold ${SCAN_STATUS_BADGE[s.status] ?? ""}">${esc(s.status)}</span></td>
              <td class="py-3 font-mono text-zinc-700 font-medium">${s.processed}/${s.total || "?"}</td>
              <td class="py-3 text-xs text-zinc-500 max-w-xs truncate" title="${esc(s.message || "")}">${esc(s.message || "–")}</td>
              <td class="py-3 flex items-center gap-1.5 whitespace-nowrap">
                ${isActiveScan(s) ? `<button data-cancel="${s.id}" class="text-xs bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 rounded-md px-2.5 py-1 font-semibold">Annuler</button>` : `<span class="text-xs text-zinc-400 font-medium">Terminé</span>`}
                <button type="button" class="btn-view-scan-logs text-xs bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-200 rounded-md px-2 py-1 font-semibold inline-flex items-center gap-1 shadow-sm transition-colors" data-scan-id="${s.id}" data-scan-title="${esc(s.query)} · ${esc(s.city)}">📋 Logs</button>
              </td>
            </tr>`;
    })
    .join("");
}

export function renderLiveScanCard(scans: ScanJob[]): string {
  const active = scans.find(isActiveScan);
  if (!active) {
    const latest = scans[0];
    if (latest && latest.status === "done" && latest.finished_at) {
      return `
      <div id="live_scan_card" class="scroll-mt-24 bg-gradient-to-r from-emerald-50/70 via-teal-50/40 to-white rounded-2xl border border-emerald-200 p-5 shadow-sm space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2.5">
            <span class="flex h-2.5 w-2.5 relative">
              <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span class="text-xs font-bold uppercase tracking-wider text-emerald-800 bg-emerald-100/80 px-2.5 py-0.5 rounded-md border border-emerald-200">Dernier Scan Terminé</span>
            <span class="text-xs text-zinc-500">Job #${latest.id} · ${esc(latest.query)} à ${esc(latest.city)}</span>
          </div>
          <a href="/" class="text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:underline inline-flex items-center gap-1">
            <span>Voir les leads dans le Pipeline Closer</span>
            ${icon("external", "w-3 h-3")}
          </a>
        </div>
        <div class="bg-white/95 rounded-xl p-3 border border-emerald-100 flex items-center justify-between text-xs sm:text-sm">
          <div class="flex items-center gap-2 font-medium text-zinc-700">
            ${icon("check-circle", "w-4 h-4 text-emerald-600")}
            <span id="live_scan_msg">${esc(latest.message || `${latest.processed}/${latest.total || latest.processed} leads traités`)}</span>
          </div>
          <span id="live_scan_counter" class="font-mono text-emerald-700 font-bold">${latest.processed} leads synchronisés</span>
        </div>
      </div>`;
    }
    return `<div id="live_scan_card" class="scroll-mt-24 hidden"></div>`;
  }

  const isRunning = active.status === "running";
  const targetObj = active.total > 0 ? active.total : active.lead_limit;
  const pct = targetObj > 0 ? Math.min(100, Math.round((active.processed / targetObj) * 100)) : (isRunning ? 15 : 0);
  const msg = active.message || (isRunning ? "Traitement par le worker local sur Mac..." : "En attente du worker local...");

  const isMaps = msg.includes("Étape 1") || msg.includes("Maps") || msg.includes("Cartographie") || msg.includes("Recherche") || msg.includes("Collecte");
  const isInspection = msg.includes("Inspection") || msg.includes("Audit") || msg.includes("site");
  const isDemo = msg.includes("Tailwind") || msg.includes("démo") || msg.includes("Génération");
  const isFlyer = msg.includes("Flyer") || msg.includes("Battlecard") || msg.includes("Pitch");
  const isSync = msg.includes("Envoi") || msg.includes("Cloud") || msg.includes("synchronisé") || msg.includes("terminé");

  // Détection des métriques dans le message en direct
  const potMatch = msg.match(/(\d+)\s+potentiels/);
  const potDisplay = potMatch ? `${potMatch[1]} fiches` : (isMaps ? "En exploration..." : "-");

  return `
  <div id="live_scan_card" class="scroll-mt-24 bg-zinc-950 text-white rounded-2xl p-5 shadow-xl border border-zinc-800 space-y-4">
    <!-- Header -->
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <span class="flex h-3 w-3 relative">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full ${isRunning ? "bg-cyan-400" : "bg-amber-400"} opacity-75"></span>
          <span class="relative inline-flex rounded-full h-3 w-3 ${isRunning ? "bg-cyan-500" : "bg-amber-500"}"></span>
        </span>
        <div>
          <div class="flex items-center gap-2">
            <span id="live_scan_badge" class="text-xs font-bold uppercase tracking-wider ${isRunning ? "text-cyan-300 bg-cyan-950/80 border border-cyan-800" : "text-amber-300 bg-amber-950/80 border border-amber-800"} px-2.5 py-0.5 rounded-md">
              ${isRunning ? "Scan en cours d'exécution" : "Job en file d'attente"}
            </span>
            <span class="text-xs text-zinc-400 font-mono">Job #${active.id}</span>
          </div>
          <p class="text-sm font-semibold text-white mt-0.5">
            ${esc(active.query)} · <span class="text-cyan-300">${esc(active.city)}</span>
            <span class="text-xs text-zinc-400 font-normal ml-1">(Objectif : ${active.lead_limit} qualifiés${active.use_cdp ? " · CDP actif" : ""})</span>
          </p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button data-cancel="${active.id}" class="text-xs bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-white border border-rose-500/30 rounded-lg px-3 py-1.5 font-semibold transition-all inline-flex items-center gap-1.5">
          ${icon("x-circle", "w-3.5 h-3.5")} Annuler ce scan
        </button>
      </div>
    </div>

    <!-- 3 Cartes Métriques Clés : Potentiels, Objectif, Qualifiés -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <!-- 1. Potentiels Détectés -->
      <div class="bg-zinc-900/90 border border-zinc-800 rounded-xl p-3 flex items-center justify-between">
        <div>
          <p class="text-[11px] font-medium text-zinc-400">1. Potentiels Repérés</p>
          <p id="live_scan_potentials" class="text-base sm:text-lg font-mono font-bold text-indigo-300">${potDisplay}</p>
          <p class="text-[10px] text-zinc-500">Fiches brutes Maps explorées</p>
        </div>
        <div class="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-lg">
          ${icon("search", "w-4 h-4")}
        </div>
      </div>

      <!-- 2. Objectif Qualifiés -->
      <div class="bg-zinc-900/90 border border-zinc-800 rounded-xl p-3 flex items-center justify-between">
        <div>
          <p class="text-[11px] font-medium text-zinc-400">2. Objectif Qualifiés</p>
          <p class="text-base sm:text-lg font-mono font-bold text-amber-300">${active.lead_limit} leads</p>
          <p class="text-[10px] text-zinc-500">Avec coordonnées & téléphone</p>
        </div>
        <div class="p-2.5 bg-amber-500/10 text-amber-400 rounded-lg">
          ${icon("target", "w-4 h-4")}
        </div>
      </div>

      <!-- 3. Qualifiés Validés & Traités -->
      <div class="bg-zinc-900/90 border border-zinc-800 rounded-xl p-3 flex items-center justify-between">
        <div>
          <p class="text-[11px] font-medium text-zinc-400">3. Qualifiés Traités</p>
          <p id="live_scan_counter" class="text-base sm:text-lg font-mono font-bold text-emerald-300">
            ${active.processed} / ${targetObj}
          </p>
          <p class="text-[10px] text-zinc-500">Audit, Démo Tailwind & Sync CRM</p>
        </div>
        <div class="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-lg">
          ${icon("check-circle", "w-4 h-4")}
        </div>
      </div>
    </div>

    <!-- Stepper Visuel des 5 Étapes -->
    <div class="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1 text-xs">
      <div id="step_maps" class="rounded-xl px-2.5 py-2 border transition-all ${isMaps ? "bg-indigo-600/30 border-indigo-400 text-white font-bold ring-1 ring-indigo-400" : "bg-zinc-900 border-zinc-800 text-zinc-400"}">
        <div class="flex items-center gap-1.5"><span class="w-4 h-4 rounded-full bg-zinc-800 text-zinc-300 inline-flex items-center justify-center text-[10px] font-bold">1</span> <span>Maps Scraper</span></div>
        <p class="text-[10px] opacity-75 truncate mt-0.5">Collecte & filtrage tél</p>
      </div>
      <div id="step_audit" class="rounded-xl px-2.5 py-2 border transition-all ${isInspection ? "bg-indigo-600/30 border-indigo-400 text-white font-bold ring-1 ring-indigo-400" : "bg-zinc-900 border-zinc-800 text-zinc-400"}">
        <div class="flex items-center gap-1.5"><span class="w-4 h-4 rounded-full bg-zinc-800 text-zinc-300 inline-flex items-center justify-center text-[10px] font-bold">2</span> <span>Audit & Tests</span></div>
        <p class="text-[10px] opacity-75 truncate mt-0.5">Analyse du site web</p>
      </div>
      <div id="step_demo" class="rounded-xl px-2.5 py-2 border transition-all ${isDemo ? "bg-indigo-600/30 border-indigo-400 text-white font-bold ring-1 ring-indigo-400" : "bg-zinc-900 border-zinc-800 text-zinc-400"}">
        <div class="flex items-center gap-1.5"><span class="w-4 h-4 rounded-full bg-zinc-800 text-zinc-300 inline-flex items-center justify-center text-[10px] font-bold">3</span> <span>Démo Tailwind</span></div>
        <p class="text-[10px] opacity-75 truncate mt-0.5">Site vitrine IA & Logo</p>
      </div>
      <div id="step_flyer" class="rounded-xl px-2.5 py-2 border transition-all ${isFlyer ? "bg-indigo-600/30 border-indigo-400 text-white font-bold ring-1 ring-indigo-400" : "bg-zinc-900 border-zinc-800 text-zinc-400"}">
        <div class="flex items-center gap-1.5"><span class="w-4 h-4 rounded-full bg-zinc-800 text-zinc-300 inline-flex items-center justify-center text-[10px] font-bold">4</span> <span>Flyer & Pitch</span></div>
        <p class="text-[10px] opacity-75 truncate mt-0.5">PDF QR & Battlecard</p>
      </div>
      <div id="step_sync" class="col-span-2 sm:col-span-1 rounded-xl px-2.5 py-2 border transition-all ${isSync ? "bg-indigo-600/30 border-indigo-400 text-white font-bold ring-1 ring-indigo-400" : "bg-zinc-900 border-zinc-800 text-zinc-400"}">
        <div class="flex items-center gap-1.5"><span class="w-4 h-4 rounded-full bg-zinc-800 text-zinc-300 inline-flex items-center justify-center text-[10px] font-bold">5</span> <span>Sync Cloud</span></div>
        <p class="text-[10px] opacity-75 truncate mt-0.5">Pipeline CRM Closer</p>
      </div>
    </div>

    <!-- Active Step Highlight Banner -->
    <div class="bg-zinc-900/90 border border-zinc-800 rounded-xl p-3.5 space-y-1.5">
      <div class="flex items-center justify-between text-xs">
        <span class="text-cyan-300 font-semibold inline-flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
          <span id="live_scan_step_label">${isRunning ? "Opération en cours sur le prospect :" : "En attente :"}</span>
        </span>
        <span id="live_scan_pct" class="font-mono text-cyan-200 font-semibold">
          ${pct}%
        </span>
      </div>
      <p id="live_scan_msg" class="text-xs sm:text-sm font-medium text-white tracking-wide break-words">
        ${esc(msg)}
      </p>
    </div>

    <!-- Animated Progress Bar -->
    <div class="space-y-1.5">
      <div class="w-full bg-zinc-800 rounded-full h-2 overflow-hidden border border-zinc-800">
        <div id="live_scan_bar" class="bg-gradient-to-r from-cyan-500 via-indigo-500 to-emerald-400 h-2 rounded-full transition-all duration-500 ease-out ${isRunning && active.total === 0 ? "w-1/3 animate-pulse" : ""}" style="width: ${active.total > 0 ? pct : (isRunning ? 25 : 5)}%"></div>
      </div>
      <div class="flex items-center justify-between text-[11px] text-zinc-400">
        <span class="inline-flex items-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>Actualisation en direct (auto-refresh 2.5s)</span>
        </span>
        <span id="live_scan_status_text" class="font-medium text-zinc-400">
          ${isRunning ? "Worker local actif sur votre Mac" : "En attente de prise en charge par le worker"}
        </span>
      </div>
    </div>
  </div>`;
}
