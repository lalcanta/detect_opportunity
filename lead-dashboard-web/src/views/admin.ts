import { jobModeBadge } from "./jobMode";
import type { LeadRow, User } from "../types";
import { CHANNEL_IDS, CHANNEL_LABELS, DEFAULT_DIRECT_DOMAINS_OPPORTUNITY_ID, DEFAULT_OPPORTUNITY_ID } from "../../../shared/opportunities";
import { needsTab, opportunityPicker } from "./needs";

/** Change à chaque modification de public/static/cf-usage.js, pour contourner le cache du CDN. */
const CF_USAGE_ASSET_VERSION = "20261112a";
import { OPPORTUNITY_TYPES, SCANNABLE_OPPORTUNITY_TYPES, parseAllowedChannels, parseAllowedOpportunities } from "../types";
import { tokenRowForDisplay, type AdminStats, type ModelSettingRow } from "../routes/admin";
import type { ScanJob, ScheduledScan } from "../routes/scans";
import { modelPickerScript, renderFallbackPicker } from "./modelPicker";
import type { GeminiQuotaRow, GeminiQuotaSummary } from "../services/geminiQuota";
import { esc, icon, layout, navbar, type IconName } from "./layout";
import { formatStatusLabel, opportunityBadgeMeta, renderStatusPill as formatStatusPill } from "./components";
import { COMPETITOR_BENCHMARKS } from "../data/benchmarks";

interface AdminProps {
  user: User;
  leads: LeadRow[];
  users: User[];
  stats: AdminStats;
  scans: ScanJob[];
  scheduledScans?: ScheduledScan[];
  models: ModelSettingRow[];
  availableModels?: import("../types").AvailableModel[];
  tab: string;
}

function isCustomModel(provider: string, model: string, available: import("../types").AvailableModel[]): boolean {
  if (!model) return false;
  return !available.some((m) => m.provider === provider && m.model_id === model);
}

function renderModelSelectOptions(provider: string, selectedModel: string, available: import("../types").AvailableModel[]): string {
  let filtered = available.filter((m) => m.provider === provider);
  if (filtered.length === 0 && provider === "cloudflare") {
    filtered = [
      { id: 101, provider: "cloudflare", model_id: "@cf/meta/llama-3.1-8b-instruct-fp8", display_name: "Meta Llama 3.1 8B FP8 (Cloudflare Workers AI - 0€)", description: "Modèle ultrarapide 0€.", supports_vision: 0, supports_thinking: 0, is_flagship: 1, speed: "ultra", cost_tier: "eco", context_window: "128k tokens", recommended_for: "battlecard,audit", updated_at: "" },
      { id: 102, provider: "cloudflare", model_id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", display_name: "Meta Llama 3.3 70B Fast (Cloudflare Workers AI)", description: "Flagship open-weights Meta sur GPUs Cloudflare.", supports_vision: 0, supports_thinking: 0, is_flagship: 1, speed: "fast", cost_tier: "standard", context_window: "128k tokens", recommended_for: "battlecard,demo", updated_at: "" },
      { id: 103, provider: "cloudflare", model_id: "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b", display_name: "DeepSeek R1 32B (Cloudflare Workers AI)", description: "Raisonnement stratégique avec chaîne de pensée sur GPUs Cloudflare.", supports_vision: 0, supports_thinking: 1, is_flagship: 1, speed: "deep", cost_tier: "standard", context_window: "64k tokens", recommended_for: "audit,battlecard", updated_at: "" },
    ];
  }
  const flagships = filtered.filter((m) => m.is_flagship !== 0);
  const others = filtered.filter((m) => m.is_flagship === 0);

  let html = "";
  let matched = false;

  const renderOpt = (m: import("../types").AvailableModel) => {
    const isSel = m.model_id === selectedModel;
    if (isSel) matched = true;
    const speedLabel = m.speed === "ultra" ? "[Ultra]" : m.speed === "deep" ? "[Deep]" : "[Rapide]";
    const costLabel = m.cost_tier === "eco" ? "[Eco]" : m.cost_tier === "premium" ? "[Premium]" : "[Std]";
    return `<option value="${esc(m.model_id)}" ${isSel ? "selected" : ""}>${speedLabel} ${costLabel} ${esc(m.display_name)}</option>`;
  };

  if (flagships.length > 0) {
    html += `<optgroup label="Modèles Phares Recommandés">`;
    for (const m of flagships) html += renderOpt(m);
    html += `</optgroup>`;
  }

  if (others.length > 0) {
    html += `<optgroup label="Déclinaisons Secondaires & Snapshots">`;
    for (const m of others) html += renderOpt(m);
    html += `</optgroup>`;
  }

  html += `<optgroup label="Saisie manuelle"><option value="__custom__" ${!matched && selectedModel ? "selected" : ""}>Saisie personnalisée / autre...</option></optgroup>`;
  return html;
}

function renderModelInfoBox(target: string, initialModelId: string, available: import("../types").AvailableModel[]): string {
  const m = available.find((x) => x.model_id === initialModelId);
  const speedLabel = m?.speed === "ultra" ? "Ultra-rapide (~1s)" : m?.speed === "deep" ? "Réflexion (~5-8s)" : "Rapide (~2-3s)";
  const speedBadge = m?.speed === "ultra" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : m?.speed === "deep" ? "bg-purple-50 text-purple-700 border-purple-200" : "bg-blue-50 text-blue-700 border-blue-200";

  const costLabel = m?.cost_tier === "eco" ? "Très économique" : m?.cost_tier === "premium" ? "Premium" : "Standard";
  const costBadge = m?.cost_tier === "eco" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : m?.cost_tier === "premium" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-zinc-100 text-zinc-700 border-zinc-200";

  return `
  <div id="model_info_${target}" class="bg-white border border-zinc-200 rounded-xl p-3 text-xs space-y-2 shadow-sm">
    <div class="flex flex-wrap items-center gap-1.5 font-semibold">
      <span id="badge_speed_${target}" class="px-2 py-0.5 rounded-md border text-[11px] ${speedBadge}">${speedLabel}</span>
      <span id="badge_cost_${target}" class="px-2 py-0.5 rounded-md border text-[11px] ${costBadge}">${costLabel}</span>
      <span id="badge_ctx_${target}" class="px-2 py-0.5 rounded-md bg-zinc-100 border border-zinc-200 text-zinc-700 text-[11px] font-mono">${esc(m?.context_window || "1M tokens")}</span>
      <span id="badge_vision_${target}" class="px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-700 text-[11px] ${m?.supports_vision ? "" : "hidden"}">Vision</span>
      <span id="badge_thinking_${target}" class="px-2 py-0.5 rounded-md bg-purple-50 border border-purple-200 text-purple-700 text-[11px] ${m?.supports_thinking ? "" : "hidden"}">Thinking</span>
    </div>
    <p id="desc_${target}" class="text-zinc-600 text-[11px] leading-relaxed">
      ${esc(m?.description || "Modèle sélectionné pour cette action.")}
    </p>
  </div>`;
}

const QUOTA_STATE_STYLE: Record<GeminiQuotaRow["state"], { bar: string; label: string; text: string }> = {
  ok: { bar: "bg-emerald-500", label: "Disponible", text: "text-emerald-700" },
  warning: { bar: "bg-amber-500", label: "Bientôt atteint", text: "text-amber-700" },
  exhausted: { bar: "bg-rose-500", label: "Atteint", text: "text-rose-700" },
  no_free_tier: { bar: "bg-zinc-300", label: "Pas de palier gratuit", text: "text-zinc-500" },
  unknown: { bar: "bg-zinc-300", label: "Limite inconnue", text: "text-zinc-500" },
};

/** Carte « Quotas Gemini du jour » : appels comptés par l'outil face aux limites gratuites de la console. */
function renderGeminiQuotaCard(g: GeminiQuotaSummary | undefined): string {
  if (!g) return "";
  const reset = new Date(g.resetAt).toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });
  const rows = g.rows.length
    ? g.rows
        .map((r) => {
          const st = QUOTA_STATE_STYLE[r.state];
          return `<tr class="align-top">
            <td class="py-2.5 pr-3">
              <div class="font-mono font-medium text-zinc-800 whitespace-nowrap">${esc(r.model)}</div>
              <div class="text-[10px] text-zinc-500 mt-0.5">${r.usedBy.length ? esc(r.usedBy.join(" · ")) : "Non utilisé par une action"}</div>
            </td>
            <td class="py-2.5 pr-3 w-[38%] min-w-[140px]">
              <div class="flex items-baseline justify-between gap-2 text-xs">
                <span class="font-mono font-bold text-zinc-900">${r.callsToday}${r.rpd !== null ? ` / ${r.rpd}` : ""}</span>
                <span class="text-[10px] font-semibold ${st.text}">${st.label}</span>
              </div>
              <div class="h-1.5 rounded-full bg-zinc-100 mt-1 overflow-hidden" role="img" aria-label="${r.callsToday} appels sur ${r.rpd ?? "?"}">
                <div class="h-full ${st.bar}" style="width:${r.rpd ? Math.max(r.callsToday ? 2 : 0, r.percent) : 0}%"></div>
              </div>
              ${r.rpm ? `<div class="text-[10px] text-zinc-400 mt-1">${r.rpm} requêtes / minute</div>` : ""}
            </td>
            <td class="py-2.5">
              <div class="flex items-center gap-1 justify-end">
                <input type="number" min="0" step="1" value="${r.rpd ?? ""}" data-quota-model="${esc(r.model)}" aria-label="Limite par jour de ${esc(r.model)}" class="quota-input w-20 border border-zinc-200 rounded-md px-2 py-1 text-xs font-mono text-right bg-white">
                <button type="button" class="quota-save text-[11px] font-semibold px-2 py-1 rounded-md bg-zinc-900 text-white hover:bg-zinc-700" data-quota-model="${esc(r.model)}">OK</button>
              </div>
              <div class="text-[10px] text-right mt-0.5 ${r.custom ? "text-indigo-600" : "text-zinc-400"}">${r.custom ? "saisie manuelle" : "valeur console"}</div>
            </td>
          </tr>`;
        })
        .join("")
    : `<tr><td colspan="3" class="py-6 text-center text-zinc-400">Aucun modèle Gemini configuré ni utilisé aujourd'hui.</td></tr>`;
  return `
      <div class="bg-white rounded-2xl shadow-sm border border-zinc-200/80 p-5 space-y-3">
        <div>
          <h3 class="font-bold text-sm text-zinc-900">Quotas Gemini du jour</h3>
          <p class="text-xs text-zinc-500 mt-0.5">Appels comptés par l'outil depuis minuit heure du Pacifique, face aux limites gratuites par jour. Remise à zéro à ${reset} (heure de Paris). Les appels faits ailleurs avec la même clé ne sont pas comptés ; avec deux clés sur deux projets Google, la limite réelle est doublée.</p>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-xs">
            <thead class="text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-200">
              <tr><th class="text-left font-semibold py-2">Modèle</th><th class="text-left font-semibold py-2">Appels du jour</th><th class="text-right font-semibold py-2">Limite / jour</th></tr>
            </thead>
            <tbody class="divide-y divide-zinc-100">${rows}</tbody>
          </table>
        </div>
        <p id="quota_msg" class="text-xs text-zinc-500" role="status"></p>
      </div>
`;
}

function renderThinkingSlider(target: string, value: number): string {
  const getLabel = (v: number) => {
    if (v === 0) return "0 (Désactivé - Rapide)";
    if (v <= 2048) return `${v} tokens (Équilibré)`;
    if (v <= 4096) return `${v} tokens (Approfondi)`;
    return `${v} tokens (Raisonnement Max)`;
  };
  const getBadgeClass = (v: number) => {
    if (v === 0) return "text-zinc-600 bg-zinc-100 border border-zinc-200";
    if (v <= 2048) return "text-indigo-600 bg-indigo-50 border border-indigo-200";
    if (v <= 4096) return "text-purple-600 bg-purple-50 border border-purple-200";
    return "text-amber-700 bg-amber-50 border border-amber-200";
  };
  return `
  <div class="space-y-1.5 pt-1">
    <div class="flex items-center justify-between">
      <label class="text-xs font-semibold text-zinc-700 block">Budget Réflexion (Thinking) :</label>
      <span id="thk_${target}_val" class="text-xs font-mono font-bold px-2 py-0.5 rounded ${getBadgeClass(value)}">
        ${getLabel(value)}
      </span>
    </div>
    <input id="thk_${target}" type="range" min="0" max="8192" step="512" value="${value}" class="w-full h-1.5 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-indigo-600">
    <div class="flex justify-between text-[10px] text-zinc-500 font-medium">
      <span>0 (Direct)</span>
      <span>2048 (Recommandé)</span>
      <span>4096 (Profond)</span>
      <span>8192 (Max)</span>
    </div>
  </div>`;
}

function renderLiveScanCard(scans: ScanJob[]): string {
  const active = scans.find((s) => s.status === "running" || s.status === "queued");
  if (!active) {
    const latest = scans[0];
    if (latest && latest.status === "done" && latest.finished_at) {
      return `
      <div id="live_scan_card" class="bg-gradient-to-r from-emerald-50/70 via-teal-50/40 to-white rounded-2xl border border-emerald-200 p-5 shadow-sm space-y-3">
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
    return `<div id="live_scan_card" class="hidden"></div>`;
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
  <div id="live_scan_card" class="bg-zinc-950 text-white rounded-2xl p-5 shadow-xl border border-zinc-800 space-y-4">
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
          <span id="live_scan_step_label">Opération en cours sur le prospect :</span>
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
          ${isRunning ? "Worker local actif sur votre Mac" : "En attente du worker local..."}
        </span>
      </div>
    </div>
  </div>`;
}
export function adminPage({ user, leads, users, stats, scans, scheduledScans = [], models, availableModels = [], tab }: AdminProps): string {
  const badge: Record<string, string> = {
    queued: "bg-zinc-100 text-zinc-700",
    running: "bg-blue-100 text-blue-700 animate-pulse font-bold",
    done: "bg-emerald-100 text-emerald-800 font-bold",
    failed: "bg-rose-100 text-rose-800 font-bold",
    cancelled: "bg-amber-100 text-amber-800",
  };
  const hasActive = scans.some((s) => s.status === "queued" || s.status === "running");
  const closers = users.filter((u) => u.role === "closer" && u.is_active);
  const conv = stats.total ? ((stats.won / stats.total) * 100).toFixed(1) : "0.0";
  const hot = stats.byStatus.find((s) => s.status === "hot_lead")?.n ?? 0;
  const card = "bg-white rounded-2xl shadow-sm border border-zinc-200/80 p-5";

  const mDemo = models.find((m) => m.action_type === "demo") || { provider: "cloudflare", model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", thinking_budget: 0, fallback_models: null as string | null };
  const mAudit = models.find((m) => m.action_type === "audit") || { provider: "cloudflare", model: "@cf/meta/llama-3.1-8b-instruct-fp8", thinking_budget: 0, fallback_models: null as string | null };
  const mCard = models.find((m) => m.action_type === "battlecard") || { provider: "cloudflare", model: "@cf/meta/llama-3.1-8b-instruct-fp8", thinking_budget: 0, fallback_models: null as string | null };

  const pendingLeads = leads.filter((l) => l.status === "pending_generation");
  const pendingCount = pendingLeads.length;
  // Leads déjà confiés à un job de génération API en attente ou en cours.
  const busyGeneration = new Set<string>();
  for (const j of scans) {
    if (j.job_type !== "generate" || (j.status !== "queued" && j.status !== "running")) continue;
    try {
      const ids = JSON.parse(j.lead_ids || "[]");
      if (Array.isArray(ids)) for (const id of ids) if (typeof id === "string") busyGeneration.add(id);
    } catch {
      // ignoré
    }
  }
  const generatableCount = pendingLeads.filter((l) => !busyGeneration.has(l.id)).length;
  const unqualifiedLeads = leads.filter((l) => l.status === "unqualified");
  const unqualifiedReasons = (raw: string | null): string[] => {
    try {
      const a = JSON.parse(raw || "{}") as { unqualified_reasons?: unknown };
      return Array.isArray(a.unqualified_reasons) ? a.unqualified_reasons.filter((r): r is string => typeof r === "string") : [];
    } catch {
      return [];
    }
  };

  const adminTabs: [string, IconName, string][] = [
    ["overview", "chart", "Vue d'ensemble & KPIs"],
    ["scanner", "target", `Scanner Local & Jobs${hasActive ? ' <span class="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-cyan-500 text-white font-extrabold animate-pulse">en cours</span>' : ""}`],
    ["needs", "sliders", "Besoins"],
    ["pending", "clock", `File CLI 0€${pendingCount > 0 ? ` <span class="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-amber-500 text-white font-extrabold">${pendingCount}</span>` : ""}`],
    ["models", "cpu", "Modèles IA par Action"],
    [
      "quotas",
      "shield",
      `Quotas & Coûts IA${
        stats.quotas?.safetyStatus === "danger"
          ? ' <span class="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-rose-500 text-white font-extrabold animate-pulse">Alerte</span>'
          : stats.quotas?.safetyStatus === "warning"
            ? ' <span class="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-amber-500 text-white font-extrabold">70%</span>'
            : ' <span class="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-emerald-500 text-white font-extrabold">0€</span>'
      }`,
    ],
    ["benchmarks", "sparkles", "Benchmarks Concurrents"],
    ["team", "users", "Équipe & Closers"],
    ["attribution", "layers", "Attribution des Leads"],
  ];

  const body = `<div class="w-full min-h-screen bg-zinc-100/70 pb-16 font-sans">

  <!-- Sub-Navbar Navigation Admin -->
  <div class="bg-white border-b border-zinc-200/80 shadow-sm sticky top-[49px] z-20">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between gap-3">
      <div class="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-2.5 min-w-0">
        ${adminTabs
          .map(
            ([k, ic, label]) =>
              `<a href="/admin?tab=${k}" class="shrink-0 flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                tab === k
                  ? "bg-zinc-900 text-white shadow-sm"
                  : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
              }">${icon(ic, `w-3.5 h-3.5 ${tab === k ? "text-indigo-400" : "text-zinc-500"}`)}<span>${label}</span></a>`,
          )
          .join("")}
      </div>
      <a href="/" class="shrink-0 hidden md:inline-flex items-center gap-1 text-xs text-zinc-700 font-semibold hover:text-indigo-600 px-2.5 py-1.5 rounded-lg hover:bg-zinc-50 transition-colors">
        <span>Pipeline Closer</span>
        ${icon("external", "w-3 h-3 text-zinc-400")}
      </a>
    </div>
  </div>

  <main class="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">

  ${
    /* ========================================================================= */
    /* ONGLET 1 : VUE D'ENSEMBLE & KPIS                                         */
    /* ========================================================================= */
    tab === "overview"
      ? `<section class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div class="${card}"><p class="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Total Prospects</p><p class="text-3xl font-extrabold text-zinc-900 mt-1 tracking-tight">${stats.total}</p></div>
      <div class="${card}"><p class="text-xs font-semibold text-rose-600 uppercase tracking-wider flex items-center gap-1">${icon("flame", "w-3.5 h-3.5 text-rose-500")} Leads Chauds</p><p class="text-3xl font-extrabold text-rose-600 mt-1 tracking-tight">${hot}</p></div>
      <div class="${card}"><p class="text-xs font-semibold text-emerald-600 uppercase tracking-wider flex items-center gap-1">${icon("check-circle", "w-3.5 h-3.5 text-emerald-600")} Deals Gagnés</p><p class="text-3xl font-extrabold text-emerald-600 mt-1 tracking-tight">${stats.won}</p></div>
      <div class="${card}"><p class="text-xs font-semibold text-indigo-600 uppercase tracking-wider flex items-center gap-1">${icon("chart", "w-3.5 h-3.5 text-indigo-600")} Taux de Conversion</p><p class="text-3xl font-extrabold text-indigo-600 mt-1 tracking-tight">${conv}%</p></div>
    </section>

    <section class="${card} space-y-3">
      <h2 class="font-semibold text-sm text-zinc-900 flex items-center gap-2">${icon("chart", "w-4 h-4 text-zinc-600")} Entonnoir Commercial</h2>
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
        ${stats.byStatus
          .map(
            (s) => `<div class="bg-zinc-50 border border-zinc-200/70 rounded-xl p-3 text-center">
            <span class="text-xs text-zinc-600 font-semibold block truncate">${esc(formatStatusLabel(s.status))}</span>
            <span class="text-xl font-bold text-zinc-900 mt-0.5 block">${s.n}</span>
          </div>`,
          )
          .join("")}
      </div>
    </section>

    <section class="${card} space-y-3">
      <div class="flex items-center justify-between">
        <h2 class="font-semibold text-sm text-zinc-900 flex items-center gap-2">${icon("cpu", "w-4 h-4 text-zinc-600")} Consommation des Tokens IA</h2>
        <span class="text-xs text-zinc-400">Suivi par modèle · Cloudflare : journée en cours uniquement</span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-xs sm:text-sm">
          <thead><tr class="text-left text-zinc-500 border-b border-zinc-200 pb-2">
            <th class="py-2">Modèle IA</th><th class="py-2">Tokens Entrée</th><th class="py-2">Tokens Sortie</th><th class="py-2">Tokens Réflexion</th>
          </tr></thead>
          <tbody>
          ${
            stats.tokens
              .map(
                (t) => {
                  const d = tokenRowForDisplay(t);
                  return `<tr class="border-b border-zinc-100 hover:bg-zinc-50">
              <td class="py-2.5 font-mono font-medium text-zinc-800">${esc(t.model)}${d.todayOnly ? ' <span class="text-[10px] font-sans text-indigo-600">aujourd\'hui</span>' : ""}</td>
              <td class="py-2.5 text-zinc-600">${d.input.toLocaleString()}</td>
              <td class="py-2.5 text-zinc-600">${d.output.toLocaleString()}</td>
              <td class="py-2.5 text-zinc-600">${d.thinking.toLocaleString()}</td>
            </tr>`;
                },
              )
              .join("") || `<tr><td colspan="4" class="text-zinc-400 py-4 text-center">Aucune consommation enregistrée</td></tr>`
          }
          </tbody>
        </table>
      </div>
    </section>`
      : ""
  }

  ${
    /* ========================================================================= */
    /* ONGLET 2 : SCANNER LOCAL & JOBS                                          */
    /* ========================================================================= */
    tab === "scanner"
      ? `${renderLiveScanCard(scans)}
    <section class="${card} space-y-5">
      <div class="border-b border-zinc-100 pb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="font-bold text-base text-zinc-900 flex items-center gap-2">${icon("target", "w-4 h-4 text-zinc-700")} Scanner une Zone Géographique sur Carte</h2>
          <p class="text-xs text-zinc-500">Pointez la zone à prospecter sur la carte, ajustez le rayon, et ciblez tous les professionnels ou plusieurs métiers simultanément.</p>
        </div>
        <button type="button" id="btn_geo" class="text-xs bg-zinc-900 hover:bg-zinc-800 text-white font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-sm transition-all">
          ${icon("map-pin", "w-3.5 h-3.5")} Me géolocaliser
        </button>
      </div>

      <!-- Recherche ville + Slider Rayon -->
      <div class="grid md:grid-cols-3 gap-3 items-center">
        <div class="md:col-span-2 flex items-center gap-2">
          <input id="mapsearch" placeholder="Rechercher une commune (ex: Pamiers, Toulouse, Lyon, Foix)..." class="flex-1 border border-zinc-200 rounded-lg px-3 py-2 text-xs bg-white focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-all">
          <button type="button" id="btn_search_map" class="text-xs bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-semibold px-3.5 py-2 rounded-lg transition-all inline-flex items-center gap-1">
            ${icon("search", "w-3.5 h-3.5")} Centrer
          </button>
        </div>
        <div class="bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-1.5 flex items-center justify-between">
          <span class="text-xs font-semibold text-zinc-600">Rayon : <span id="radius_val" class="text-indigo-600 font-bold">5 km</span></span>
          <input id="radius_slider" type="range" min="1" max="50" value="5" step="1" class="w-28 cursor-pointer accent-zinc-900">
        </div>
      </div>

      <!-- Carte Leaflet Interactive -->
      <div class="relative">
        <div id="map" class="h-80 w-full rounded-xl border border-zinc-300 shadow-inner z-0"></div>
        <div class="absolute bottom-2 left-2 z-10 bg-white/95 backdrop-blur px-3 py-1.5 rounded-lg border border-zinc-200 shadow-md text-xs flex items-center gap-3">
          <span class="inline-flex items-center gap-1">${icon("map-pin", "w-3 h-3 text-zinc-500")} <strong>Zone :</strong> <span id="zone_name" class="text-zinc-800 font-medium">Pamiers (09100)</span></span>
          <span class="text-zinc-300">|</span>
          <span><strong>Coords :</strong> <span id="zone_coords" class="font-mono text-zinc-600">43.116, 1.611</span></span>
        </div>
      </div>

      <!-- Presets de Cibles Multi-Métiers -->
      <div class="space-y-2 pt-1">
        <label class="text-xs font-semibold text-zinc-700 flex items-center gap-1.5">
          ${icon("target", "w-3.5 h-3.5 text-zinc-500")} Choix de la Cible (Recherche multi-métiers)
        </label>
        <div class="flex flex-wrap gap-1.5" id="presets_list">
          <button type="button" data-preset="artisans, commerces" class="preset-btn text-xs px-3 py-1.5 rounded-lg border font-semibold transition-all bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm">Tous commerces & artisans</button>
          <button type="button" data-preset="plombier, électricien, serrurier, menuisier, maçon, peintre, couvreur" class="preset-btn text-xs px-3 py-1.5 rounded-lg border font-semibold transition-all bg-white hover:bg-zinc-50 border-zinc-200 text-zinc-700">Artisans BTP</button>
          <button type="button" data-preset="boulangerie, boucherie, coiffeur, fleuriste, institut de beauté, caviste" class="preset-btn text-xs px-3 py-1.5 rounded-lg border font-semibold transition-all bg-white hover:bg-zinc-50 border-zinc-200 text-zinc-700">Commerces de proximité</button>
          <button type="button" data-preset="restaurant, pizzeria, brasserie, traiteur" class="preset-btn text-xs px-3 py-1.5 rounded-lg border font-semibold transition-all bg-white hover:bg-zinc-50 border-zinc-200 text-zinc-700">Restauration</button>
          <button type="button" data-preset="garage automobile, carrosserie, contrôle technique" class="preset-btn text-xs px-3 py-1.5 rounded-lg border font-semibold transition-all bg-white hover:bg-zinc-50 border-zinc-200 text-zinc-700">Auto & Garages</button>
          <button type="button" data-preset="entreprises, services, agence" class="preset-btn text-xs px-3 py-1.5 rounded-lg border font-semibold transition-all bg-white hover:bg-zinc-50 border-zinc-200 text-zinc-700">PME & Services</button>
          <button type="button" data-preset="agence web, agence digitale, studio créatif, agence communication" class="preset-btn text-xs px-3 py-1.5 rounded-lg border font-semibold transition-all bg-white hover:bg-zinc-50 border-zinc-200 text-zinc-700">Agences Web (Maps)</button>
          <button type="button" data-preset="domains:digidop.fr" data-opp="${DEFAULT_DIRECT_DOMAINS_OPPORTUNITY_ID}" class="preset-btn text-xs px-3 py-1.5 rounded-lg border font-semibold transition-all bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-800">🛡️ Liste de Domaines en Direct (sans Maps)</button>
        </div>
      </div>

      <!-- Formulaire de Scan -->
      <div class="grid sm:grid-cols-4 gap-3 pt-1">
        <div class="sm:col-span-2">
          <label class="text-xs font-semibold text-zinc-700 block mb-1">Mots-clés Maps OU Domaines en direct (séparés par virgules)</label>
          <input id="q" placeholder="Ex: artisans, commerces OU domains:digidop.fr, acme-studio.fr..." value="artisans, commerces" class="w-full border border-zinc-200 rounded-lg px-3 py-2 text-xs bg-white focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-all">
          <span class="text-[10px] text-zinc-500 mt-0.5 block">Astuce : collez directement des noms de domaines (ex: <code>digidop.fr, studio.fr</code>) pour auditer sans Maps</span>
        </div>
        <div>
          <label class="text-xs font-semibold text-zinc-700 block mb-1">Nom de la Zone / Secteur</label>
          <input id="c" placeholder="Ex: Pamiers, Lyon..." value="Pamiers" class="w-full border border-zinc-200 rounded-lg px-3 py-2 text-xs bg-white focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-all">
        </div>
        <div>
          <label class="text-xs font-semibold text-zinc-700 block mb-1">Objectif de leads qualifiés</label>
          <input id="n" type="number" value="10" min="1" max="100" class="w-full border border-zinc-200 rounded-lg px-3 py-2 text-xs bg-white focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-all">
          <span class="text-[10px] text-zinc-500 mt-0.5 block">Prospects remplissant les prérequis de l'opportunité</span>
        </div>
      </div>

      <!-- Besoin ciblé : il fixe aussi le filtre de site -->
      <div class="pt-1">
        <span class="text-xs font-semibold text-zinc-700 block mb-1.5">Besoin ciblé</span>
        ${opportunityPicker("opp_type", DEFAULT_OPPORTUNITY_ID)}
      </div>

      <!-- Mode d'Exécution : Full Auto vs Préparation CLI 0€ -->
      <div class="pt-2 border-t border-zinc-100">
        <label class="text-xs font-semibold text-zinc-700 block mb-2">Mode d'exécution du Scan</label>
        <div class="grid sm:grid-cols-2 gap-3">
          <label class="flex items-start gap-3 p-3 rounded-xl border border-zinc-200 bg-white hover:border-zinc-300 cursor-pointer has-[:checked]:border-emerald-600 has-[:checked]:bg-emerald-50/40 transition-all">
            <input type="radio" name="execution_mode" value="full_auto" checked class="mt-0.5 text-emerald-600 focus:ring-emerald-500">
            <div>
              <span class="block text-xs font-bold text-zinc-900">⚡ Cycle Complet (Full Auto API)</span>
              <span class="block text-[11px] text-zinc-500 mt-0.5 leading-snug">Scraping + Inspection + Démos Tailwind &amp; Battlecards générées automatiquement via vos clés API et synchronisées au CRM Cloud.</span>
            </div>
          </label>
          <label class="flex items-start gap-3 p-3 rounded-xl border border-zinc-200 bg-white hover:border-zinc-300 cursor-pointer has-[:checked]:border-indigo-600 has-[:checked]:bg-indigo-50/40 transition-all">
            <input type="radio" name="execution_mode" value="prep_only" class="mt-0.5 text-indigo-600 focus:ring-indigo-500">
            <div>
              <span class="block text-xs font-bold text-zinc-900">🛠️ Préparation CLI 0€ (Mode Scans + Antigravity)</span>
              <span class="block text-[11px] text-zinc-500 mt-0.5 leading-snug">Scraping + Inspection + Flyers stockés dans <code>queue/pending/</code>. Démos &amp; battlecards générées via Antigravity CLI sans coût API externe.</span>
            </div>
          </label>
        </div>
      </div>

      <input type="hidden" id="lat" value="43.1158">
      <input type="hidden" id="lng" value="1.6112">
      <input type="hidden" id="radius_km" value="5">

      <div class="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-zinc-100">
        <div class="relative group flex items-center gap-2">
          <label class="flex items-center gap-2 text-xs font-semibold text-zinc-700 p-2 border border-zinc-200 rounded-lg bg-zinc-50 cursor-pointer hover:bg-zinc-100">
            <input id="cdp" type="checkbox" class="rounded text-zinc-900 focus:ring-0">
            <span>Mode CDP (Chrome visible &amp; anti-captcha)</span>
          </label>
          <button type="button" aria-label="Information sur le Mode CDP" class="w-5 h-5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] font-extrabold inline-flex items-center justify-center hover:bg-indigo-100 focus:outline-none">
            ?
          </button>
          <!-- Infobulle (Tooltip) explicative du Mode CDP -->
          <div class="invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 transition-all duration-150 absolute bottom-full left-0 mb-2 w-80 sm:w-96 p-3.5 bg-zinc-950 text-white text-[11px] leading-relaxed rounded-xl shadow-xl border border-zinc-800 z-30 pointer-events-none space-y-1.5">
            <p class="font-bold text-indigo-300 flex items-center gap-1.5">
              <span>🌐 Qu'est-ce que le Mode CDP (Chrome DevTools Protocol) ?</span>
            </p>
            <p class="text-zinc-300">
              Par défaut, le scanner tourne en arrière-plan dans un navigateur invisible (<em>Headless Chromium</em>).
            </p>
            <p class="text-zinc-300">
              En activant <strong>CDP</strong>, le worker se pilote via votre vrai navigateur Google Chrome local (port <code>9222</code>) ou ouvre une fenêtre visible :
            </p>
            <ul class="list-disc list-inside text-zinc-300 space-y-0.5">
              <li>Réutilise votre session et empreinte réelle (évite les blocages Google Maps sur gros volumes).</li>
              <li>Vous permet de résoudre manuellement un éventuel Captcha si Google en affiche un.</li>
            </ul>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <button id="launch" class="text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-5 py-2 font-semibold shadow-sm transition-colors inline-flex items-center gap-1.5">
            ${icon("play", "w-3.5 h-3.5")} Démarrer le Scan sur cette Zone
          </button>
          <span id="launchmsg" class="text-xs font-semibold"></span>
        </div>
      </div>
    </section>

    <!-- ========================================================================= -->
    <!-- SECTION SCAN AUTOMATISÉ : PROGRAMMATION & SCANS RÉCURRENTS (CRON)         -->
    <!-- ========================================================================= -->
    <section class="${card} space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 pb-3">
        <div>
          <div class="flex items-center gap-2">
            <h2 class="font-bold text-base text-zinc-900 flex items-center gap-2">${icon("clock", "w-4 h-4 text-purple-700")} Scans Automatiques Programmés (Heure Fixe & Jours)</h2>
            <span class="text-xs bg-purple-50 border border-purple-200 text-purple-800 font-bold px-2.5 py-0.5 rounded-md">${scheduledScans.length} programmation(s)</span>
          </div>
          <p class="text-xs text-zinc-500">Programmez vos campagnes de prospection pour qu'elles se lancent toutes seules chaque matin sans intervention manuelle.</p>
        </div>
        <button type="button" id="btn_toggle_new_schedule" class="text-xs bg-purple-700 hover:bg-purple-800 text-white font-semibold px-3.5 py-2 rounded-lg transition-all inline-flex items-center gap-1.5 shadow-sm">
          ${icon("calendar", "w-3.5 h-3.5")} + Nouvelle Programmation
        </button>
      </div>

      <!-- Formulaire déroulant de création de planification -->
      <div id="new_schedule_box" class="hidden border border-purple-200 rounded-xl p-4 bg-purple-50/40 space-y-3">
        <h3 class="font-bold text-xs uppercase tracking-wider text-purple-950 flex items-center gap-1.5">
          ${icon("calendar", "w-3.5 h-3.5 text-purple-700")} Définir un scan automatique récurrent
        </h3>

        <div class="grid sm:grid-cols-3 gap-3">
          <div>
            <label class="text-xs font-semibold text-zinc-700 block mb-1">Nom / Libellé de la routine</label>
            <input id="sched_label" placeholder="Ex: Matinale Plombiers Toulouse" value="Matinale Artisans" class="w-full border border-zinc-200 rounded-lg px-3 py-2 text-xs bg-white font-medium focus:ring-1 focus:ring-purple-600">
          </div>
          <div>
            <label class="text-xs font-semibold text-zinc-700 block mb-1">Heure de déclenchement (HH:mm)</label>
            <input id="sched_time" type="time" value="08:30" class="w-full border border-zinc-200 rounded-lg px-3 py-2 text-xs bg-white font-mono font-bold text-purple-900 focus:ring-1 focus:ring-purple-600">
          </div>
          <div>
            <label class="text-xs font-semibold text-zinc-700 block mb-1">Jours de la semaine</label>
            <select id="sched_days" class="w-full border border-zinc-200 rounded-lg px-3 py-2 text-xs bg-white font-semibold focus:ring-1 focus:ring-purple-600">
              <option value="1,2,3,4,5" selected>Du Lundi au Vendredi (Semaine ouvrée)</option>
              <option value="*">Tous les jours (7j/7)</option>
              <option value="1">Tous les Lundis</option>
              <option value="2">Tous les Mardis</option>
              <option value="3">Tous les Mercredis</option>
              <option value="4">Tous les Jeudis</option>
              <option value="5">Tous les Vendredis</option>
            </select>
          </div>
        </div>

        <div class="grid sm:grid-cols-4 gap-3 pt-1">
          <div class="sm:col-span-2">
            <label class="text-xs font-semibold text-zinc-700 block mb-1">Cible / Métiers</label>
            <input id="sched_q" placeholder="Ex: plombier, chauffagiste, électricien" value="artisans, commerces" class="w-full border border-zinc-200 rounded-lg px-3 py-2 text-xs bg-white focus:ring-1 focus:ring-purple-600">
          </div>
          <div>
            <label class="text-xs font-semibold text-zinc-700 block mb-1">Ville / Secteur</label>
            <input id="sched_c" placeholder="Ex: Pamiers, Toulouse..." value="Pamiers" class="w-full border border-zinc-200 rounded-lg px-3 py-2 text-xs bg-white focus:ring-1 focus:ring-purple-600">
          </div>
          <div>
            <label class="text-xs font-semibold text-zinc-700 block mb-1">Quota leads / jour</label>
            <input id="sched_n" type="number" value="10" min="1" max="50" class="w-full border border-zinc-200 rounded-lg px-3 py-2 text-xs bg-white font-mono focus:ring-1 focus:ring-purple-600">
          </div>
        </div>

        <div class="pt-1">
          <span class="text-xs font-semibold text-zinc-700 block mb-1.5">Besoin ciblé</span>
          ${opportunityPicker("sched_opp", DEFAULT_OPPORTUNITY_ID)}
        </div>

        <div class="pt-1">
          <label class="text-xs font-semibold text-zinc-700 block mb-1.5">Mode d'exécution automatique</label>
          <div class="grid sm:grid-cols-2 gap-3">
            <label class="flex items-start gap-2.5 p-2.5 rounded-lg border border-purple-200 bg-white hover:border-purple-300 cursor-pointer has-[:checked]:border-purple-600 has-[:checked]:bg-purple-50/60 transition-all">
              <input type="radio" name="sched_exec_mode" value="full_auto" checked class="mt-0.5 text-purple-700 focus:ring-purple-600">
              <div>
                <span class="block text-xs font-bold text-zinc-900">⚡ Cycle Complet (Full Auto API)</span>
                <span class="block text-[10px] text-zinc-500 leading-tight">Génération IA immédiate et injection directe dans le CRM Cloud.</span>
              </div>
            </label>
            <label class="flex items-start gap-2.5 p-2.5 rounded-lg border border-purple-200 bg-white hover:border-purple-300 cursor-pointer has-[:checked]:border-purple-600 has-[:checked]:bg-purple-50/60 transition-all">
              <input type="radio" name="sched_exec_mode" value="prep_only" class="mt-0.5 text-purple-700 focus:ring-purple-600">
              <div>
                <span class="block text-xs font-bold text-zinc-900">🛠️ Préparation CLI 0€ (Queue locale)</span>
                <span class="block text-[10px] text-zinc-500 leading-tight">Stocke les dossiers dans <code>queue/pending/</code> prêts pour Antigravity.</span>
              </div>
            </label>
          </div>
        </div>

        <div class="flex items-center justify-between pt-2 border-t border-purple-200">
          <label class="inline-flex items-center gap-2 text-xs font-semibold text-zinc-700 cursor-pointer">
            <input id="sched_cdp" type="checkbox" class="rounded text-purple-700 focus:ring-0">
            <span>Activer Mode CDP (Chrome visible)</span>
          </label>
          <div class="flex items-center gap-2">
            <button type="button" id="btn_cancel_schedule" class="text-xs bg-zinc-200 hover:bg-zinc-300 text-zinc-700 font-semibold px-3 py-1.5 rounded-lg transition-colors">
              Annuler
            </button>
            <button type="button" id="btn_save_schedule" class="text-xs bg-purple-700 hover:bg-purple-800 text-white font-semibold px-4 py-1.5 rounded-lg shadow-sm transition-colors inline-flex items-center gap-1.5">
              ${icon("save", "w-3.5 h-3.5")} Enregistrer la Planification
            </button>
          </div>
        </div>
        <div id="sched_msg" class="text-xs font-semibold"></div>
      </div>

      <!-- Tableau des programmations existantes -->
      <div class="overflow-x-auto">
        <table class="w-full text-xs sm:text-sm">
          <thead>
            <tr class="text-left text-zinc-500 border-b pb-2 text-xs">
              <th class="py-2">Routine & Cadence</th>
              <th>Heure & Jours</th>
              <th>Cible & Ville</th>
              <th>Besoin</th>
              <th>Dernier Lancement</th>
              <th>État</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-100 text-xs">
            ${
              scheduledScans.length > 0
                ? scheduledScans
                    .map((s) => {
                      const daysLabel =
                        s.days_of_week === "1,2,3,4,5"
                          ? "Lun-Ven"
                          : s.days_of_week === "*"
                            ? "Tous les jours"
                            : `Jour ${s.days_of_week}`;
                      const o = opportunityBadgeMeta(s.opportunity_type);
                      const isPrep = s.execution_mode === "prep_only";
                      const modeBadge = isPrep
                        ? `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">🛠️ CLI 0€</span>`
                        : `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">⚡ Full Auto</span>`;
                      return `<tr class="hover:bg-zinc-50">
                        <td class="py-3 font-semibold text-zinc-900">
                          <div class="flex items-center gap-1.5">
                            <span class="block">${esc(s.label)}</span>
                            ${modeBadge}
                          </div>
                          <span class="font-mono text-[11px] text-zinc-400">#sched-${s.id} · ${s.lead_limit} leads</span>
                        </td>
                        <td class="py-3">
                          <span class="px-2 py-0.5 rounded font-mono font-bold text-xs bg-purple-50 text-purple-900 border border-purple-200">
                            ⏰ ${esc(s.time_of_day)}
                          </span>
                          <span class="block text-[11px] text-zinc-500 mt-0.5">${esc(daysLabel)}</span>
                        </td>
                        <td class="py-3">
                          <span class="font-semibold text-zinc-800 block">${esc(s.query)}</span>
                          <span class="text-zinc-500 text-[11px]">${esc(s.city)}</span>
                        </td>
                        <td class="py-3">
                          <span class="px-2 py-0.5 rounded text-[11px] font-semibold border ${o.cls}">${o.label}</span>
                        </td>
                        <td class="py-3 text-zinc-500 font-mono text-[11px]">
                          ${s.last_run_at ? new Date(s.last_run_at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "Jamais"}
                        </td>
                        <td class="py-3">
                          <button type="button" data-sched-toggle="${s.id}" class="px-2 py-0.5 rounded text-xs font-semibold transition-colors ${
                            s.is_active ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200" : "bg-zinc-200 text-zinc-600 hover:bg-zinc-300"
                          }">
                            ${s.is_active ? "✔ Actif" : "⏸ En Pause"}
                          </button>
                        </td>
                        <td class="py-3">
                          <div class="flex items-center gap-1.5">
                            <button type="button" data-sched-run="${s.id}" class="text-[11px] bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 px-2.5 py-1 rounded-md font-semibold transition-colors" title="Lancer ce scan immédiatement sans attendre l'heure">
                              ⚡ Lancer
                            </button>
                            <button type="button" data-sched-delete="${s.id}" class="text-[11px] text-zinc-400 hover:text-rose-600 hover:bg-rose-50 p-1 rounded transition-colors" title="Supprimer cette programmation">
                              ${icon("x", "w-3.5 h-3.5")}
                            </button>
                          </div>
                        </td>
                      </tr>`;
                    })
                    .join("")
                : `<tr><td colspan="7" class="text-zinc-400 py-6 text-center">Aucun scan automatique programmé. Cliquez sur "+ Nouvelle Programmation" ci-dessus pour planifier vos recherches du matin.</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </section>

    <section class="${card} space-y-4">
      <div class="flex items-center justify-between border-b border-zinc-100 pb-3">
        <div>
          <h2 class="font-semibold text-sm text-zinc-900 flex items-center gap-2">${icon("file-text", "w-4 h-4 text-zinc-700")} File des Jobs de Scan</h2>
          <p class="text-xs text-zinc-500">Historique des 15 derniers scans ordonnancés.</p>
        </div>
        <button onclick="location.reload()" class="text-xs bg-zinc-100 hover:bg-zinc-200 text-zinc-700 px-3 py-1.5 rounded-lg font-semibold inline-flex items-center gap-1">
          ${icon("refresh", "w-3.5 h-3.5")} Actualiser
        </button>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-xs sm:text-sm">
          <thead><tr class="text-left text-zinc-500 border-b pb-2 text-xs">
            <th class="py-2">#</th><th>Recherche</th><th>Besoin</th><th>Mode</th><th>Statut</th><th>Progression</th><th>Message de statut</th><th>Action</th>
          </tr></thead>
          <tbody id="scans_tbody" class="divide-y divide-zinc-100 text-xs">
          ${
            scans
              .map((s) => {
                const o = opportunityBadgeMeta(s.opportunity_type);
                const filterTag = s.website_filter && s.website_filter !== "all" ? ` <span class="text-[9px] opacity-75">(${s.website_filter === "no_website" ? "sans site" : "avec site"})</span>` : "";
                const modeBadge = jobModeBadge(s);
                const isGen = s.job_type === "generate";
                return `<tr class="hover:bg-zinc-50">
              <td class="py-3 font-mono font-bold text-zinc-400">${s.id}</td>
              <td class="py-3 font-semibold text-zinc-800">${esc(s.query)} · ${esc(s.city)}${isGen ? "" : ` <span class="text-xs text-zinc-400 font-normal">(${s.lead_limit} max${s.use_cdp ? ", CDP" : ""})</span>`}</td>
              <td class="py-3">${isGen ? '<span class="text-zinc-400">—</span>' : `<span class="px-2 py-0.5 rounded text-[11px] font-semibold border ${o.cls}">${o.label}${filterTag}</span>`}</td>
              <td class="py-3">${modeBadge}</td>
              <td class="py-3"><span class="px-2.5 py-0.5 rounded-md text-xs font-semibold ${badge[s.status] ?? ""}">${esc(s.status)}</span></td>
              <td class="py-3 font-mono text-zinc-700 font-medium">${s.processed}/${s.total || "?"}</td>
              <td class="py-3 text-xs text-zinc-500 max-w-xs truncate" title="${esc(s.message || '')}">${esc(s.message || "–")}</td>
              <td class="py-3 flex items-center gap-1.5 whitespace-nowrap">
                ${s.status === "queued" || s.status === "running" ? `<button data-cancel="${s.id}" class="text-xs bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 rounded-md px-2.5 py-1 font-semibold">Annuler</button>` : `<span class="text-xs text-zinc-400 font-medium">Terminé</span>`}
                <button type="button" class="btn-view-scan-logs text-xs bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-200 rounded-md px-2 py-1 font-semibold inline-flex items-center gap-1 shadow-sm transition-colors" data-scan-id="${s.id}" data-scan-title="${esc(s.query)} · ${esc(s.city)}">📋 Logs</button>
              </td>
            </tr>`;
              })
              .join("") || `<tr><td colspan="8" class="text-zinc-400 py-6 text-center">Aucun job de scan dans la file</td></tr>`
          }
          </tbody>
        </table>
      </div>

      <!-- Modal Logs de Scan en direct -->
      <div id="scan_logs_modal" class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4">
        <div class="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
          <div class="px-5 py-3.5 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/80">
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span id="scan_logs_title" class="text-xs font-mono font-bold text-zinc-200">Logs du Scan</span>
            </div>
            <button type="button" onclick="document.getElementById('scan_logs_modal').classList.add('hidden')" class="text-zinc-400 hover:text-white text-sm font-bold px-2 py-1">✕</button>
          </div>
          <div class="p-4 overflow-y-auto font-mono text-[11px] text-zinc-300 bg-zinc-950/95 leading-relaxed whitespace-pre-wrap select-text max-h-[60vh]" id="scan_logs_content">Chargement des logs...</div>
          <div class="px-5 py-2.5 border-t border-zinc-800 bg-zinc-950/80 flex items-center justify-between text-xs text-zinc-400">
            <span>Journal temps réel (Playwright, Maps, IA, CRM)</span>
            <button type="button" id="btn_refresh_cur_logs" class="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-1 rounded font-semibold text-[11px]">🔄 Actualiser</button>
          </div>
        </div>
      </div>
    </section>`
      : ""
  }

  ${
    /* ========================================================================= */
    /* ONGLET : FILE D'ATTENTE CLI 0€ (LEADS EN ATTENTE DE GÉNÉRATION)           */
    /* ========================================================================= */
    tab === "pending"
      ? `<section class="space-y-6">
      <!-- En-tête statut & instructions -->
      <div class="bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30 rounded-2xl p-6 shadow-sm">
        <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div class="space-y-1">
            <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-800 text-xs font-bold">
              ${icon("clock", "w-3.5 h-3.5 text-amber-600")}
              <span>${pendingCount} prospect(s) préparé(s) en attente</span>
            </div>
            <h2 class="text-lg font-bold text-zinc-900 mt-2">File d'Attente Génération Antigravity (0€ API Externe)</h2>
            <p class="text-xs text-zinc-600 max-w-2xl leading-relaxed">
              Ces prospects ont été qualifiés sur Google Maps et inspectés par Playwright (logos extraits, flyers PDF prêts).
              Les démos interactives et battlecards d'appel peuvent être générées à 0€ en demandant à Antigravity.
            </p>
          </div>
          <div class="bg-white/80 backdrop-blur border border-amber-200/80 rounded-xl p-4 shadow-sm text-xs space-y-2 shrink-0">
            <span class="font-bold text-zinc-900 block">⚡ Comment lancer la génération ?</span>
            <div class="font-mono bg-zinc-900 text-amber-300 px-3 py-2 rounded-lg text-[11px] select-all">
              "Génère les démos et battlecards des leads en attente"
            </div>
            <p class="text-[11px] text-zinc-500">Ou en terminal : <code class="bg-zinc-100 px-1.5 py-0.5 rounded text-zinc-800">npm run sync-queue</code></p>
          </div>
        </div>
      </div>

      <!-- Table des prospects en attente -->
      <div class="${card}">
        <div class="flex items-center justify-between pb-4 border-b border-zinc-100">
          <div class="flex items-center gap-2">
            <h3 class="font-semibold text-sm text-zinc-900">Prospects Qualifiés en Attente</h3>
            <span class="text-xs bg-zinc-100 text-zinc-700 font-semibold px-2 py-0.5 rounded">${pendingCount}</span>
          </div>
          ${
            generatableCount
              ? `<button type="button" class="btn-gen-api text-xs bg-violet-600 hover:bg-violet-700 text-white rounded-lg px-3 py-1.5 font-semibold shadow-sm inline-flex items-center gap-1.5" data-gen-all="1" title="Le worker du Mac génère démo et battlecard avec les modèles de l'onglet Modèles, puis synchronise">🤖 Tout générer via l'API (${generatableCount})</button>`
              : ""
          }
        </div>
        <p id="gen_api_msg" class="hidden mt-3 text-xs rounded-lg px-3 py-2"></p>

        <div class="overflow-x-auto mt-4">
          <table class="w-full text-xs text-left">
            <thead>
              <tr class="text-zinc-500 border-b border-zinc-100">
                <th class="py-2.5 font-semibold">Entreprise</th>
                <th class="py-2.5 font-semibold">Activité & Ville</th>
                <th class="py-2.5 font-semibold">Téléphone</th>
                <th class="py-2.5 font-semibold">Avis Google</th>
                <th class="py-2.5 font-semibold">Présence Web</th>
                <th class="py-2.5 font-semibold">Flyer PDF</th>
                <th class="py-2.5 font-semibold">Statut</th>
                <th class="py-2.5 font-semibold">Génération</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-100">
              ${
                pendingLeads
                  .map(
                    (l) => `
                <tr class="hover:bg-zinc-50/70 transition">
                  <td class="py-3 font-semibold text-zinc-900">
                    <div class="flex items-center gap-2">
                      <div class="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 font-bold flex items-center justify-center text-xs shrink-0">
                        ${esc(l.company_name.slice(0, 2).toUpperCase())}
                      </div>
                      <div>
                        <span class="block">${esc(l.company_name)}</span>
                        <span class="text-[10px] text-zinc-400 font-mono">#${esc(l.id.slice(0, 8))}</span>
                      </div>
                    </div>
                  </td>
                  <td class="py-3">
                    <span class="text-zinc-800 font-medium block">${esc(l.activity || "Artisan")}</span>
                    <span class="text-zinc-500 text-[11px]">${esc(l.city || "")}</span>
                  </td>
                  <td class="py-3 font-mono font-medium text-zinc-900">
                    ${l.phone ? `<a href="tel:${esc(l.phone)}" class="text-indigo-600 hover:underline">${esc(l.phone)}</a>` : '<span class="text-zinc-400">—</span>'}
                  </td>
                  <td class="py-3">
                    ${l.google_rating ? `<span class="inline-flex items-center gap-1 font-semibold text-amber-700 bg-amber-50 border border-amber-200/60 px-2 py-0.5 rounded text-[11px]">⭐ ${l.google_rating} <span class="text-zinc-400 font-normal">(${l.google_reviews_count || 0})</span></span>` : '<span class="text-zinc-400">—</span>'}
                  </td>
                  <td class="py-3">
                    ${l.website_url ? `<a href="${esc(l.website_url)}" target="_blank" rel="noopener" class="text-xs text-indigo-600 hover:underline inline-flex items-center gap-1">Visiter ${icon("external", "w-3 h-3")}</a>` : '<span class="text-xs px-2 py-0.5 rounded bg-zinc-100 text-zinc-600 font-medium">Aucun site</span>'}
                  </td>
                  <td class="py-3">
                    ${l.flyer_pdf_url ? `<a href="${esc(l.flyer_pdf_url)}" target="_blank" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-medium text-[11px] transition">📄 Flyer PDF</a>` : '<span class="text-zinc-400">—</span>'}
                  </td>
                  <td class="py-3">
                    <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-50 border border-amber-200 text-amber-700">
                      <span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                      En attente IA (0€)
                    </span>
                  </td>
                  <td class="py-3">
                    ${
                      busyGeneration.has(l.id)
                        ? '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-violet-50 border border-violet-200 text-violet-700"><span class="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse"></span>API en cours</span>'
                        : `<button type="button" class="btn-gen-api text-[11px] bg-white hover:bg-violet-50 text-violet-700 border border-violet-200 rounded-lg px-2.5 py-1 font-semibold" data-gen-id="${esc(l.id)}">🤖 Générer via l'API</button>`
                    }
                  </td>
                </tr>`,
                  )
                  .join("") ||
                `<tr><td colspan="8" class="text-zinc-400 py-10 text-center">Aucun prospect en attente de génération dans la file.<br><span class="text-xs text-zinc-400">Lancez un scan en mode 'Préparation CLI 0€' depuis l'onglet Scanner.</span></td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>

      <!-- Leads non qualifiés : prérequis de l'opportunité non remplis après inspection -->
      <div class="${card}">
        <div class="flex items-center justify-between pb-4 border-b border-zinc-100">
          <div class="flex items-center gap-2">
            <h3 class="font-semibold text-sm text-zinc-900">Non qualifiés après inspection</h3>
            <span class="text-xs bg-zinc-100 text-zinc-700 font-semibold px-2 py-0.5 rounded">${unqualifiedLeads.length}</span>
          </div>
          <span class="text-[11px] text-zinc-500">Hors Kanban · réutilisables pour une autre opportunité</span>
        </div>
        <div class="overflow-x-auto mt-4">
          <table class="w-full text-xs text-left">
            <thead>
              <tr class="text-zinc-500 border-b border-zinc-100">
                <th class="py-2.5 font-semibold">Entreprise</th>
                <th class="py-2.5 font-semibold">Opportunité visée</th>
                <th class="py-2.5 font-semibold">Raison</th>
                <th class="py-2.5 font-semibold">Site</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-100">
              ${
                unqualifiedLeads
                  .map(
                    (l) => `
                <tr>
                  <td class="py-2.5"><span class="font-semibold text-zinc-900 block">${esc(l.company_name)}</span><span class="text-[11px] text-zinc-500">${esc(l.activity || "")} · ${esc(l.city || "")}</span></td>
                  <td class="py-2.5">${esc(opportunityBadgeMeta(l.opportunity_type).label)}</td>
                  <td class="py-2.5 text-zinc-700">${esc(unqualifiedReasons(l.audit_data).join(" ; ") || "—")}</td>
                  <td class="py-2.5">${l.website_url ? `<a href="${esc(l.website_url)}" target="_blank" rel="noopener" class="text-indigo-600 hover:underline">Visiter</a>` : '<span class="text-zinc-400">—</span>'}</td>
                </tr>`,
                  )
                  .join("") || `<tr><td colspan="4" class="text-zinc-400 py-6 text-center">Aucun lead écarté pour l'instant.</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>
    </section>`
      : ""
  }

  ${
    /* ========================================================================= */
    /* ONGLET 3 : MODÈLES IA PAR ACTION                                         */
    /* ========================================================================= */
    tab === "models"
      ? `<section class="${card} space-y-5">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 pb-3">
        <div>
          <div class="flex items-center gap-2">
            <h2 class="font-semibold text-sm text-zinc-900 flex items-center gap-2">${icon("cpu", "w-4 h-4 text-zinc-700")} Configuration des Modèles IA</h2>
            <span class="text-xs bg-indigo-50 border border-indigo-200 text-indigo-700 font-semibold px-2.5 py-0.5 rounded-md">${availableModels.length} modèles configurés</span>
            <span class="text-[10px] bg-emerald-100 border border-emerald-300 text-emerald-800 font-bold px-2 py-0.5 rounded-md">⚡ Cloudflare Workers AI Actif</span>
          </div>
          <p class="text-xs text-zinc-500">Sélectionnez le modèle idéal par type d'action. Tous les modèles sont stockés en cache local pour une exécution ultra-rapide.</p>
        </div>
        <div class="flex items-center gap-2">
          <button id="btn_refresh_models" class="text-xs bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-semibold px-3 py-1.5 rounded-lg transition-all inline-flex items-center gap-1.5 shadow-sm">
            ${icon("refresh", "w-3.5 h-3.5")} Actualiser depuis l'API
          </button>
          <button id="savemodels" class="text-xs bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg px-4 py-1.5 font-semibold shadow-sm transition-all inline-flex items-center gap-1.5">
            ${icon("save", "w-3.5 h-3.5")} Enregistrer les Modèles
          </button>
        </div>
      </div>

      <div id="modelsmsg" class="text-xs font-semibold"></div>

      <!-- Encart explicatif : Worker API (Clés LLM) vs Antigravity CLI / Subagents (0€ API) -->
      <div class="grid md:grid-cols-2 gap-3 text-xs">
        <div class="bg-indigo-50/70 border border-indigo-200 rounded-xl p-3.5 space-y-1">
          <div class="font-bold text-indigo-950 flex items-center gap-1.5">
            ${icon("cpu", "w-3.5 h-3.5 text-indigo-600")}
            <span>Mode 1 — Worker Autonome (<code>npm run worker</code> + Bouton Scan UI)</span>
          </div>
          <p class="text-indigo-900/90 text-[11px] leading-relaxed">
            <strong>Utilise 100 % les modèles ci-dessous.</strong> À chaque job réclamé (<code>/api/worker/claim</code>), le worker local récupère vos 3 modèles (Démo, Audit, Battlecard) et leur budget de réflexion (<em>Thinking</em>) pour appeler directement Gemini, OpenAI, Anthropic ou OpenRouter.
          </p>
        </div>
        <div class="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3.5 space-y-1">
          <div class="font-bold text-emerald-950 flex items-center gap-1.5">
            ${icon("sparkles", "w-3.5 h-3.5 text-emerald-600")}
            <span>Mode 2 — Antigravity CLI / Subagents (<code>npm run prep</code> ➔ 0€ API)</span>
          </div>
          <p class="text-emerald-900/90 text-[11px] leading-relaxed">
            <code>npm run prep</code> collecte les données sans appeler d'API payante et dépose les dossiers dans <code>queue/pending/</code>. C'est ensuite l'agent ou un <strong>subagent Antigravity</strong> (paliers internes <code>flash_lite</code>, <code>flash</code> ou <code>pro</code>) qui rédige <code>demo.html</code> et <code>battlecard.json</code> avant <code>npm run sync-queue</code>.
          </p>
        </div>
      </div>

      <div class="grid md:grid-cols-3 gap-4">
        <!-- Action 1 : Démo -->
        <div class="border border-zinc-200 rounded-xl p-4 bg-zinc-50/60 space-y-3 flex flex-col justify-between">
          <div class="space-y-3">
            <div>
              <div class="flex items-center justify-between">
                <h3 class="font-semibold text-xs text-zinc-900 uppercase tracking-wider">1. Démo HTML Tailwind</h3>
                <span class="text-[10px] font-semibold uppercase tracking-wider bg-purple-100 text-purple-800 px-2 py-0.5 rounded">Frontend</span>
              </div>
              <p class="text-xs text-zinc-500 mt-0.5">Génération du code de la landing page avec vision du vieux site.</p>
            </div>

            <!-- Presets recommandés -->
            <div class="space-y-1">
              <span class="text-[10px] font-semibold text-zinc-500 uppercase">Recommandés :</span>
              <div class="flex flex-wrap gap-1">
                <button type="button" class="btn-preset-model text-[11px] px-2 py-1 rounded-md border font-semibold bg-emerald-50 hover:bg-emerald-100 border-emerald-300 text-emerald-800 shadow-sm transition-all" data-target="demo" data-prov="cloudflare" data-mod="@cf/meta/llama-3.3-70b-instruct-fp8-fast" data-thk="0">⚡ Llama 3.3 70B (0€)</button>
                <button type="button" class="btn-preset-model text-[11px] px-2 py-1 rounded-md border font-semibold bg-white hover:bg-zinc-100 border-zinc-200 text-zinc-700 shadow-sm transition-all" data-target="demo" data-prov="anthropic" data-mod="claude-5-sonnet" data-thk="0">Claude Sonnet 5</button>
                <button type="button" class="btn-preset-model text-[11px] px-2 py-1 rounded-md border font-semibold bg-white hover:bg-zinc-100 border-zinc-200 text-zinc-700 shadow-sm transition-all" data-target="demo" data-prov="openai" data-mod="gpt-5" data-thk="0">GPT-5</button>
                <button type="button" class="btn-preset-model text-[11px] px-2 py-1 rounded-md border font-semibold bg-white hover:bg-zinc-100 border-zinc-200 text-zinc-700 shadow-sm transition-all" data-target="demo" data-prov="gemini" data-mod="gemini-3.1-pro-preview" data-thk="2048">Gemini 3.1 Pro</button>
              </div>
            </div>

            <div>
              <label class="text-xs font-semibold text-zinc-700 block mb-1">Fournisseur :</label>
              <select id="prov_demo" data-target="demo" class="prov-select w-full border border-zinc-200 rounded-lg px-3 py-2 text-xs font-medium bg-white">
                <option value="cloudflare" ${mDemo.provider === "cloudflare" ? "selected" : ""}>Cloudflare Workers AI (0€)</option>
                <option value="gemini" ${mDemo.provider === "gemini" ? "selected" : ""}>Google Gemini</option>
                <option value="openai" ${mDemo.provider === "openai" ? "selected" : ""}>OpenAI</option>
                <option value="anthropic" ${mDemo.provider === "anthropic" ? "selected" : ""}>Anthropic Claude</option>
                <option value="openrouter" ${mDemo.provider === "openrouter" ? "selected" : ""}>OpenRouter / Custom</option>
              </select>
            </div>
            <div>
              <label class="text-xs font-semibold text-zinc-700 block mb-1">Sélectionner un modèle :</label>
              <select id="sel_mod_demo" data-target="demo" class="mod-select w-full border border-zinc-200 rounded-lg px-3 py-2 text-xs bg-white font-medium">
                ${renderModelSelectOptions(mDemo.provider, mDemo.model, availableModels)}
              </select>
            </div>
            <div id="custom_wrap_demo" class="${isCustomModel(mDemo.provider, mDemo.model, availableModels) ? "" : "hidden"}">
              <label class="text-xs font-semibold text-zinc-700 block mb-1">Nom du modèle personnalisé :</label>
              <input id="mod_demo" value="${esc(mDemo.model)}" class="w-full border border-zinc-200 rounded-lg px-3 py-2 text-xs font-mono bg-white">
            </div>
            ${renderThinkingSlider("demo", mDemo.thinking_budget)}
            ${renderFallbackPicker("demo", mDemo.fallback_models)}
          </div>

          <!-- Info Box Dynamique -->
          ${renderModelInfoBox("demo", mDemo.model, availableModels)}
        </div>

        <!-- Action 2 : Audit -->
        <div class="border border-zinc-200 rounded-xl p-4 bg-zinc-50/60 space-y-3 flex flex-col justify-between">
          <div class="space-y-3">
            <div>
              <div class="flex items-center justify-between">
                <h3 class="font-semibold text-xs text-zinc-900 uppercase tracking-wider">2. Audit Technique du Site</h3>
                <span class="text-[10px] font-semibold uppercase tracking-wider bg-blue-100 text-blue-800 px-2 py-0.5 rounded">Vision</span>
              </div>
              <p class="text-xs text-zinc-500 mt-0.5">Analyse de la capture d'écran, score et détection des faiblesses.</p>
            </div>

            <!-- Presets recommandés -->
            <div class="space-y-1">
              <span class="text-[10px] font-semibold text-zinc-500 uppercase">Recommandés :</span>
              <div class="flex flex-wrap gap-1">
                <button type="button" class="btn-preset-model text-[11px] px-2 py-1 rounded-md border font-semibold bg-emerald-50 hover:bg-emerald-100 border-emerald-300 text-emerald-800 shadow-sm transition-all" data-target="audit" data-prov="cloudflare" data-mod="@cf/meta/llama-3.1-8b-instruct-fp8" data-thk="0">⚡ Llama 3.1 8B (0€)</button>
                <button type="button" class="btn-preset-model text-[11px] px-2 py-1 rounded-md border font-semibold bg-white hover:bg-zinc-100 border-zinc-200 text-zinc-700 shadow-sm transition-all" data-target="audit" data-prov="gemini" data-mod="gemini-3.8-flash" data-thk="0">Gemini 3.8 Flash</button>
                <button type="button" class="btn-preset-model text-[11px] px-2 py-1 rounded-md border font-semibold bg-white hover:bg-zinc-100 border-zinc-200 text-zinc-700 shadow-sm transition-all" data-target="audit" data-prov="openai" data-mod="gpt-5-mini" data-thk="0">GPT-5 Mini</button>
                <button type="button" class="btn-preset-model text-[11px] px-2 py-1 rounded-md border font-semibold bg-white hover:bg-zinc-100 border-zinc-200 text-zinc-700 shadow-sm transition-all" data-target="audit" data-prov="anthropic" data-mod="claude-5-haiku" data-thk="0">Claude Haiku 5</button>
              </div>
            </div>

            <div>
              <label class="text-xs font-semibold text-zinc-700 block mb-1">Fournisseur :</label>
              <select id="prov_audit" data-target="audit" class="prov-select w-full border border-zinc-200 rounded-lg px-3 py-2 text-xs font-medium bg-white">
                <option value="cloudflare" ${mAudit.provider === "cloudflare" ? "selected" : ""}>Cloudflare Workers AI (0€)</option>
                <option value="gemini" ${mAudit.provider === "gemini" ? "selected" : ""}>Google Gemini</option>
                <option value="openai" ${mAudit.provider === "openai" ? "selected" : ""}>OpenAI</option>
                <option value="anthropic" ${mAudit.provider === "anthropic" ? "selected" : ""}>Anthropic Claude</option>
                <option value="openrouter" ${mAudit.provider === "openrouter" ? "selected" : ""}>OpenRouter / Custom</option>
              </select>
            </div>
            <div>
              <label class="text-xs font-semibold text-zinc-700 block mb-1">Sélectionner un modèle :</label>
              <select id="sel_mod_audit" data-target="audit" class="mod-select w-full border border-zinc-200 rounded-lg px-3 py-2 text-xs bg-white font-medium">
                ${renderModelSelectOptions(mAudit.provider, mAudit.model, availableModels)}
              </select>
            </div>
            <div id="custom_wrap_audit" class="${isCustomModel(mAudit.provider, mAudit.model, availableModels) ? "" : "hidden"}">
              <label class="text-xs font-semibold text-zinc-700 block mb-1">Nom du modèle personnalisé :</label>
              <input id="mod_audit" value="${esc(mAudit.model)}" class="w-full border border-zinc-200 rounded-lg px-3 py-2 text-xs font-mono bg-white">
            </div>
            ${renderThinkingSlider("audit", mAudit.thinking_budget)}
            ${renderFallbackPicker("audit", mAudit.fallback_models)}
          </div>

          <!-- Info Box Dynamique -->
          ${renderModelInfoBox("audit", mAudit.model, availableModels)}
        </div>

        <!-- Action 3 : Battlecard -->
        <div class="border border-zinc-200 rounded-xl p-4 bg-zinc-50/60 space-y-3 flex flex-col justify-between">
          <div class="space-y-3">
            <div>
              <div class="flex items-center justify-between">
                <h3 class="font-semibold text-xs text-zinc-900 uppercase tracking-wider">3. Battlecard & Objections</h3>
                <span class="text-[10px] font-semibold uppercase tracking-wider bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">Script</span>
              </div>
              <p class="text-xs text-zinc-500 mt-0.5">Script téléprospectrice, réponses aux objections et accroche WhatsApp.</p>
            </div>

            <!-- Presets recommandés -->
            <div class="space-y-1">
              <span class="text-[10px] font-semibold text-zinc-500 uppercase">Recommandés :</span>
              <div class="flex flex-wrap gap-1">
                <button type="button" class="btn-preset-model text-[11px] px-2 py-1 rounded-md border font-semibold bg-emerald-50 hover:bg-emerald-100 border-emerald-300 text-emerald-800 shadow-sm transition-all" data-target="card" data-prov="cloudflare" data-mod="@cf/meta/llama-3.1-8b-instruct-fp8" data-thk="0">⚡ Llama 3.1 8B (0€)</button>
                <button type="button" class="btn-preset-model text-[11px] px-2 py-1 rounded-md border font-semibold bg-white hover:bg-zinc-100 border-zinc-200 text-zinc-700 shadow-sm transition-all" data-target="card" data-prov="gemini" data-mod="gemini-3.8-flash" data-thk="0">Gemini 3.8 Flash</button>
                <button type="button" class="btn-preset-model text-[11px] px-2 py-1 rounded-md border font-semibold bg-white hover:bg-zinc-100 border-zinc-200 text-zinc-700 shadow-sm transition-all" data-target="card" data-prov="openai" data-mod="gpt-5" data-thk="0">GPT-5</button>
                <button type="button" class="btn-preset-model text-[11px] px-2 py-1 rounded-md border font-semibold bg-white hover:bg-zinc-100 border-zinc-200 text-zinc-700 shadow-sm transition-all" data-target="card" data-prov="openrouter" data-mod="deepseek/deepseek-chat" data-thk="0">DeepSeek V3</button>
              </div>
            </div>

            <div>
              <label class="text-xs font-semibold text-zinc-700 block mb-1">Fournisseur :</label>
              <select id="prov_card" data-target="card" class="prov-select w-full border border-zinc-200 rounded-lg px-3 py-2 text-xs font-medium bg-white">
                <option value="cloudflare" ${mCard.provider === "cloudflare" ? "selected" : ""}>Cloudflare Workers AI (0€)</option>
                <option value="gemini" ${mCard.provider === "gemini" ? "selected" : ""}>Google Gemini</option>
                <option value="openai" ${mCard.provider === "openai" ? "selected" : ""}>OpenAI</option>
                <option value="anthropic" ${mCard.provider === "anthropic" ? "selected" : ""}>Anthropic Claude</option>
                <option value="openrouter" ${mCard.provider === "openrouter" ? "selected" : ""}>OpenRouter / Custom</option>
              </select>
            </div>
            <div>
              <label class="text-xs font-semibold text-zinc-700 block mb-1">Sélectionner un modèle :</label>
              <select id="sel_mod_card" data-target="card" class="mod-select w-full border border-zinc-200 rounded-lg px-3 py-2 text-xs bg-white font-medium">
                ${renderModelSelectOptions(mCard.provider, mCard.model, availableModels)}
              </select>
            </div>
            <div id="custom_wrap_card" class="${isCustomModel(mCard.provider, mCard.model, availableModels) ? "" : "hidden"}">
              <label class="text-xs font-semibold text-zinc-700 block mb-1">Nom du modèle personnalisé :</label>
              <input id="mod_card" value="${esc(mCard.model)}" class="w-full border border-zinc-200 rounded-lg px-3 py-2 text-xs font-mono bg-white">
            </div>
            ${renderThinkingSlider("card", mCard.thinking_budget)}
            ${renderFallbackPicker("card", mCard.fallback_models)}
          </div>

          <!-- Info Box Dynamique -->
          ${renderModelInfoBox("card", mCard.model, availableModels)}
        </div>
      </div>

      <!-- Bouton d'enregistrement sous les 3 cartes -->
      <div class="flex flex-wrap items-center justify-between gap-3 pt-2">
        <p class="text-xs text-zinc-500">Vos modifications seront instantanément prises en compte par le worker lors des prochains scans.</p>
        <button type="button" id="savemodels_bottom" class="text-xs bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg px-5 py-2 font-semibold shadow-sm transition-all inline-flex items-center gap-1.5">
          ${icon("save", "w-3.5 h-3.5")} Enregistrer les Modèles
        </button>
      </div>

      <!-- Catalogue complet des modèles avec critères & filtres -->
      <div class="border border-zinc-200 rounded-2xl p-4 bg-white space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 pb-3">
          <div>
            <h3 class="font-semibold text-sm text-zinc-900 flex items-center gap-2">
              ${icon("layers", "w-4 h-4 text-zinc-700")} Guide & Comparatif des Modèles IA (${availableModels.length} modèles configurés)
            </h3>
            <p class="text-xs text-zinc-500">Filtrage intelligent pour éviter les doublons de versions (snapshots secondaires masqués par défaut).</p>
          </div>
          <div class="flex items-center gap-1.5 text-xs bg-zinc-100 p-1 rounded-lg">
            <button type="button" id="tab_models_flagship" class="px-3 py-1 rounded-md font-semibold bg-white text-zinc-900 shadow-sm transition-all">Modèles Phares</button>
            <button type="button" id="tab_models_all" class="px-3 py-1 rounded-md font-medium text-zinc-600 hover:text-zinc-900 transition-all">Tous (+ Archives)</button>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-xs sm:text-sm">
            <thead>
              <tr class="text-left text-zinc-500 border-b pb-2 text-xs">
                <th class="py-2">Modèle & Id</th>
                <th>Fournisseur</th>
                <th>Vitesse & Latence</th>
                <th>Coût Estimé</th>
                <th>Fenêtre Contexte</th>
                <th>Capacités</th>
                <th>Rôle Recommandé</th>
              </tr>
            </thead>
            <tbody id="models_table_body" class="divide-y divide-zinc-100 text-xs">
              ${availableModels
                .map((m) => {
                  const isF = m.is_flagship !== 0;
                  const speedText = m.speed === "ultra" ? "Ultra (< 1s)" : m.speed === "deep" ? "Réflexion (~6s)" : "Rapide (~2s)";
                  const costText = m.cost_tier === "eco" ? "Économique" : m.cost_tier === "premium" ? "Premium" : "Standard";
                  return `
                  <tr class="hover:bg-zinc-50 model-row ${isF ? "is-flagship" : "is-secondary hidden"}" data-flagship="${isF ? "1" : "0"}">
                    <td class="py-2.5">
                      <div class="flex items-center gap-1.5">
                        <span class="font-semibold text-zinc-900">${esc(m.display_name)}</span>
                        ${isF ? `<span class="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">Phare</span>` : ""}
                      </div>
                      <span class="font-mono text-[11px] text-zinc-400 block">${esc(m.model_id)}</span>
                    </td>
                    <td class="py-2.5">
                      <span class="px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                        m.provider === "gemini"
                          ? "bg-blue-50 text-blue-700 border border-blue-200"
                          : m.provider === "openai"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : m.provider === "anthropic"
                              ? "bg-amber-50 text-amber-700 border border-amber-200"
                              : "bg-purple-50 text-purple-700 border border-purple-200"
                      }">${esc(m.provider)}</span>
                    </td>
                    <td class="py-2.5 font-medium text-zinc-700">${speedText}</td>
                    <td class="py-2.5 font-medium text-zinc-700">${costText}</td>
                    <td class="py-2.5 font-mono text-zinc-600">${esc(m.context_window || "1M tokens")}</td>
                    <td class="py-2.5">
                      <div class="flex items-center gap-1">
                        ${m.supports_vision ? `<span class="px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] font-medium">Vision</span>` : ""}
                        ${m.supports_thinking ? `<span class="px-1.5 py-0.5 rounded bg-purple-50 border border-purple-200 text-purple-700 text-[10px] font-medium">Thinking</span>` : ""}
                      </div>
                    </td>
                    <td class="py-2.5 text-zinc-600 max-w-xs truncate">${esc(m.description || "–")}</td>
                  </tr>`;
                })
                .join("")}
            </tbody>
          </table>
        </div>
      </div>

      <div class="p-3 bg-blue-50/60 border border-blue-200 rounded-xl text-xs text-blue-900 space-y-1">
        <p class="font-semibold flex items-center gap-1.5">${icon("zap", "w-3.5 h-3.5 text-blue-600")} Configuration des clés d'API correspondantes :</p>
        <p class="text-blue-800">Les clés des fournisseurs choisis (<code>GEMINI_API_KEY_1</code>, <code>OPENAI_API_KEY</code>, <code>ANTHROPIC_API_KEY</code>, etc.) se renseignent dans le fichier <code>lead-engine-cli/.env</code> de votre Mac.</p>
      </div>
    </section>`
      : ""
  }

  ${
    /* ========================================================================= */
    /* ONGLET : COCKPIT DE SÉCURITÉ DES QUOTAS & COÛTS IA                       */
    /* ========================================================================= */
    tab === "quotas"
      ? `<div class="space-y-6">
      <section id="cf-usage" aria-live="polite" class="bg-white rounded-2xl p-6 shadow-sm border border-zinc-200/80">
        <p class="text-sm text-zinc-500">Chargement de la consommation Cloudflare…</p>
      </section>
      <script src="/static/cf-usage.js?v=${CF_USAGE_ASSET_VERSION}" defer></script>
      <!-- 1. En-tête : Avertisseur de Sécurité & Statut Financier -->
      <div class="bg-white rounded-2xl p-6 shadow-sm border ${
        stats.quotas?.safetyStatus === "danger"
          ? "border-rose-300 bg-rose-50/40"
          : stats.quotas?.safetyStatus === "warning"
            ? "border-amber-300 bg-amber-50/40"
            : "border-emerald-200/80 bg-emerald-50/30"
      }">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div class="flex items-start gap-4">
            <div class="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${
              stats.quotas?.safetyStatus === "danger"
                ? "bg-rose-600 text-white shadow-rose-600/20"
                : stats.quotas?.safetyStatus === "warning"
                  ? "bg-amber-500 text-white shadow-amber-500/20"
                  : "bg-emerald-600 text-white shadow-emerald-600/20"
            }">
              ${icon("shield", "w-6 h-6")}
            </div>
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <span class="text-xs uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-full ${
                  stats.quotas?.safetyStatus === "danger"
                    ? "bg-rose-100 text-rose-800"
                    : stats.quotas?.safetyStatus === "warning"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-emerald-100 text-emerald-800"
                }">
                  ${
                    stats.quotas?.safetyStatus === "danger"
                      ? "🛑 RISQUE DE FACTURATION"
                      : stats.quotas?.safetyStatus === "warning"
                        ? "⚠️ SEUIL GRATUIT PROCHE"
                        : "✅ FEU VERT : 100% GRATUIT"
                  }
                </span>
                <span class="text-xs text-zinc-500">Puis-je continuer à utiliser l'application ?</span>
              </div>
              <h2 class="text-lg font-bold text-zinc-900">${esc(stats.quotas?.safetyMessage || "Feu vert : aucun frais engagé.")}</h2>
              <p class="text-xs text-zinc-600">
                ${
                  stats.quotas?.canContinueSafely
                    ? "Toutes vos opérations actuelles tournent sous les quotas gratuits Cloudflare (10 000 neurones/jour offerts) ou en mode CLI 0€. Aucun centime n'est engagé."
                    : "Attention, un dépassement de quota ou un modèle payant a été détecté. Activez le coupe-circuit ci-contre pour bloquer immédiatement tout appel API externe."
                }
              </p>
            </div>
          </div>
          <div class="flex items-center gap-3 shrink-0">
            <button type="button" id="btn-circuit-breaker" class="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs shadow-sm transition-all ${
              stats.quotas?.safetyStatus === "danger"
                ? "bg-rose-600 hover:bg-rose-700 text-white shadow-rose-500/30 animate-pulse"
                : "bg-zinc-900 hover:bg-zinc-800 text-white"
            }">
              ${icon("zap", "w-4 h-4 text-amber-400")}
              <span>Coupe-Circuit 0€ (Stop API)</span>
            </button>
          </div>
        </div>
      </div>

      <!-- 2. Les 3 Jauges Clés : Cloudflare Neurones, Coût Estimé, Nuances Design -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <!-- Carte 1 : Cloudflare Free Tier -->
        <div class="bg-white rounded-2xl p-5 shadow-sm border border-zinc-200/80 space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Cloudflare Workers AI</span>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">10k neurones/j</span>
          </div>
          <div class="space-y-1.5">
            <div class="flex items-baseline justify-between">
              <span class="text-2xl font-extrabold text-zinc-900 font-mono">${(stats.quotas?.cloudflareNeuronsToday || 0).toLocaleString()}</span>
              <span class="text-xs font-semibold text-zinc-400">/ 10 000 neurones</span>
            </div>
            <!-- Progress Bar -->
            <div class="w-full h-2.5 bg-zinc-100 rounded-full overflow-hidden border border-zinc-200/60">
              <div class="h-full transition-all duration-500 rounded-full ${
                (stats.quotas?.cloudflareUsedPercent || 0) >= 90
                  ? "bg-rose-500"
                  : (stats.quotas?.cloudflareUsedPercent || 0) >= 70
                    ? "bg-amber-500"
                    : "bg-emerald-500"
              }" style="width: ${Math.max(2, stats.quotas?.cloudflareUsedPercent || 0)}%;"></div>
            </div>
          </div>
          <p class="text-[11px] text-zinc-500 flex items-center justify-between">
            <span>Consommé aujourd'hui : <strong>${stats.quotas?.cloudflareUsedPercent || 0}%</strong></span>
            <span>Reset à minuit UTC</span>
          </p>
        </div>

        <!-- Carte 2 : Coût Réel Estimé du Mois -->
        <div class="bg-white rounded-2xl p-5 shadow-sm border border-zinc-200/80 space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Coût Estimé Facturable</span>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">En direct</span>
          </div>
          <div class="space-y-1">
            <div class="text-2xl font-extrabold text-zinc-900 font-mono flex items-baseline gap-1">
              <span>${(stats.quotas?.totalCostEstimateEur || 0).toFixed(2)}</span>
              <span class="text-base font-bold text-zinc-400">€</span>
            </div>
            <p class="text-xs text-zinc-500">
              ${
                (stats.quotas?.totalCostEstimateEur || 0) === 0
                  ? "Zéro euro engagé. Vous profitez pleinement des quotas gratuits."
                  : "Dépassement en cours sur les modèles payants configurés."
              }
            </p>
          </div>
          <p class="text-[11px] text-zinc-400">Basé sur les tarifs officiels par million de tokens.</p>
        </div>

        <!-- Carte 3 : Registre des Archétypes & Nuances Design -->
        <div class="bg-gradient-to-br from-indigo-900 via-indigo-950 to-zinc-900 text-white rounded-2xl p-5 border border-indigo-500/30 shadow-sm space-y-3 flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold text-indigo-300 uppercase tracking-wider">Design Frontend Craft</span>
              <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-200 border border-indigo-400/30">Sur-mesure</span>
            </div>
            <h3 class="text-sm font-bold text-white mt-2">Nuances & Archétypes de Design</h3>
            <p class="text-xs text-zinc-300 mt-1">Chaque métier dispose de sa propre palette chromatique et de composants interactifs pour éviter les templates répétitifs.</p>
          </div>
          <a href="/admin?tab=benchmarks" class="inline-flex items-center gap-1.5 text-xs text-indigo-300 font-semibold hover:text-white transition-colors">
            <span>Consulter les benchmarks & styles</span>
            ${icon("external", "w-3 h-3")}
          </a>
        </div>
      </div>

      ${renderGeminiQuotaCard(stats.gemini)}

      <!-- 3. Tableau Détaillé par Modèle -->
      <div class="bg-white rounded-2xl shadow-sm border border-zinc-200/80 p-5 space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="font-bold text-sm text-zinc-900">Détail des Consommations & Tarification par Modèle</h3>
            <p class="text-xs text-zinc-500 mt-0.5">Tokens échangés et estimation financière. Les modèles Cloudflare n'affichent que la journée en cours (quota gratuit quotidien).</p>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-xs sm:text-sm">
            <thead>
              <tr class="text-left text-zinc-500 border-b border-zinc-200 pb-2">
                <th class="py-2">Modèle</th>
                <th class="py-2">Régime de Quota</th>
                <th class="py-2 text-center">Appels (Aujourd'hui / Total)</th>
                <th class="py-2 text-right">Tokens Entrée</th>
                <th class="py-2 text-right">Tokens Sortie</th>
                <th class="py-2 text-right">Coût Estimé</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-100">
              ${
                stats.tokens.length > 0
                  ? stats.tokens
                      .map((t) => {
                        const d = tokenRowForDisplay(t);
                        return `
                    <tr class="hover:bg-zinc-50 transition-colors">
                      <td class="py-2.5 font-mono font-medium text-zinc-800">${esc(t.model)}</td>
                      <td class="py-2.5">
                        ${
                          t.quotaCategory === "cloudflare_free"
                            ? '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">Cloudflare Free Tier (10k neurones/j)</span>'
                            : t.quotaCategory === "gemini_free_tier"
                              ? '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">Google Free Tier</span>'
                              : t.quotaCategory === "cli_0euro"
                                ? '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">Mode CLI 0€ (Antigravity)</span>'
                                : '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-100 text-zinc-700 border border-zinc-200">Pay-As-You-Go</span>'
                        }
                      </td>
                      <td class="py-2.5 text-center font-mono text-zinc-600">${d.calls}${d.todayOnly ? ' <span class="text-[10px] font-sans text-indigo-600">aujourd\'hui</span>' : ""}</td>
                      <td class="py-2.5 text-right font-mono text-zinc-600">${d.input.toLocaleString()}</td>
                      <td class="py-2.5 text-right font-mono text-zinc-600">${d.output.toLocaleString()}</td>
                      <td class="py-2.5 text-right font-mono font-bold ${d.costEur > 0 ? "text-rose-600" : "text-emerald-600"}">${d.costEur.toFixed(4)} €${d.todayOnly ? ' <span class="text-[10px] font-sans font-normal text-indigo-600">/ jour</span>' : ""}</td>
                    </tr>
                  `;
                      })
                      .join("")
                  : `<tr><td colspan="6" class="text-zinc-400 py-6 text-center">Aucune consommation enregistrée pour le moment. Vos appels tournent en 0€ de frais.</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>

      <!-- 4. Guide Pratique Anti-Dépassement -->
      <div class="grid md:grid-cols-3 gap-4">
        <div class="p-4 bg-zinc-50 border border-zinc-200 rounded-xl space-y-1.5 text-xs">
          <p class="font-bold text-zinc-900 flex items-center gap-1.5">${icon("shield", "w-4 h-4 text-emerald-600")} 1. Privilégier le mode CLI 0€</p>
          <p class="text-zinc-600">Pour le gros volume (cartographie Maps, scraping, génération du code HTML Tailwind lourd), utilisez le mode <strong>Préparation CLI 0€</strong>. Zéro coût de token, illimité.</p>
        </div>
        <div class="p-4 bg-zinc-50 border border-zinc-200 rounded-xl space-y-1.5 text-xs">
          <p class="font-bold text-zinc-900 flex items-center gap-1.5">${icon("zap", "w-4 h-4 text-indigo-600")} 2. Llama 3.1 8B pour les Battlecards</p>
          <p class="text-zinc-600">Sur Cloudflare, <strong>Llama 3.1 8B</strong> consomme 10 fois moins de neurones que les 70B. Il vous permet de faire jusqu'à <strong>400 générations gratuites par jour</strong>.</p>
        </div>
        <div class="p-4 bg-zinc-50 border border-zinc-200 rounded-xl space-y-1.5 text-xs">
          <p class="font-bold text-zinc-900 flex items-center gap-1.5">${icon("alert-circle", "w-4 h-4 text-amber-600")} 3. Le Coupe-Circuit de secours</p>
          <p class="text-zinc-600">En cas de doute ou si vous prêtez l'accès à un closer, cliquez sur <em>« Coupe-Circuit 0€ »</em> en haut à droite : toutes les requêtes basculeront sur la file locale sans coût.</p>
        </div>
      </div>
    </div>`
      : ""
  }

  ${tab === "needs" ? needsTab() : ""}

  ${
    /* ========================================================================= */
    /* ONGLET : BASE DE CONNAISSANCES & BENCHMARKS CONCURRENTS                  */
    /* ========================================================================= */
    tab === "benchmarks"
      ? `<div class="space-y-6">
      <!-- Directives Clés : Vrai Logo & Inspiration Concurrents -->
      <div class="grid md:grid-cols-2 gap-4">
        <!-- Règle 1 : Logo Réel -->
        <div class="bg-gradient-to-br from-indigo-900 via-indigo-950 to-zinc-900 text-white rounded-2xl p-5 border border-indigo-500/30 shadow-sm space-y-2.5">
          <div class="flex items-center gap-2">
            <span class="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-300 flex items-center justify-center font-bold text-sm border border-indigo-400/30">1</span>
            <h2 class="font-bold text-sm text-white">Reprise Stricte du Vrai Logo Client</h2>
          </div>
          <p class="text-xs text-indigo-200/90 leading-relaxed">
            <strong class="text-white">On reprend le logo officiel du client, on n'en réinvente pas un.</strong> Si un logo existe sur son ancien site ou sa présence en ligne, il est extrait, téléchargé et directement intégré sans altération. S'il n'en a pas, son nom d'enseigne est stylisé en logotype textuel (Wordmark) moderne, sans symbole artificiel inventé.
          </p>
          <div class="pt-1 flex items-center gap-2 text-[11px] text-indigo-300 font-medium">
            ${icon("check-circle", "w-3.5 h-3.5 text-emerald-400")}
            <span>Le design Tailwind et la palette se modernisent autour de son logo réel</span>
          </div>
        </div>

        <!-- Règle 2 : Benchmarks Leaders -->
        <div class="bg-gradient-to-br from-emerald-900 via-emerald-950 to-zinc-900 text-white rounded-2xl p-5 border border-emerald-500/30 shadow-sm space-y-2.5">
          <div class="flex items-center gap-2">
            <span class="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center font-bold text-sm border border-emerald-400/30">2</span>
            <h2 class="font-bold text-sm text-white">Inspiration des Leaders à Fort Trafic</h2>
          </div>
          <p class="text-xs text-emerald-200/90 leading-relaxed">
            Pour chaque métier ciblé, le moteur de génération injecte les <strong class="text-white">standards d'ergonomie et de conversion des sites français qui captent le plus de trafic Google</strong> (MesDépanneurs, IZI by EDF, Attila, etc.) : Hero percutant, badges de réassurance, grille de 6 prestations et barre d'appel sticky mobile.
          </p>
          <div class="pt-1 flex items-center gap-2 text-[11px] text-emerald-300 font-medium">
            ${icon("check-circle", "w-3.5 h-3.5 text-emerald-400")}
            <span>Sélection automatique du benchmark adapté au métier lors du scan</span>
          </div>
        </div>
      </div>

      <!-- Liste des Benchmarks par Secteur -->
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="font-bold text-base text-zinc-900 flex items-center gap-2">
            ${icon("sparkles", "w-4 h-4 text-indigo-600")}
            <span>Base de Connaissances par Métier (${COMPETITOR_BENCHMARKS.length} profils documentés)</span>
          </h3>
          <span class="text-xs text-zinc-500">Injecté dynamiquement dans les démos HTML</span>
        </div>

        <div class="grid lg:grid-cols-2 gap-4">
          ${COMPETITOR_BENCHMARKS.map((b) => {
            return `<div class="${card} space-y-4 border-l-4 border-l-indigo-600">
              <div class="flex items-start justify-between gap-3 border-b border-zinc-100 pb-3">
                <div>
                  <h4 class="font-bold text-sm text-zinc-900">${esc(b.categoryName)}</h4>
                  <p class="text-xs text-zinc-500 mt-0.5">Mots-clés cibles : <code class="text-[11px] bg-zinc-100 px-1 py-0.5 rounded text-zinc-700">${esc(b.targetKeywords.slice(0, 5).join(", "))}…</code></p>
                </div>
                <span class="text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-md">Benchmark Leader</span>
              </div>

              <!-- Leaders de référence -->
              <div class="space-y-1.5 text-xs bg-zinc-50/70 p-3 rounded-xl border border-zinc-100">
                <span class="font-bold text-zinc-800 flex items-center gap-1.5">
                  ${icon("target", "w-3.5 h-3.5 text-indigo-600")}
                  <span>Modèles de trafic de référence :</span>
                </span>
                ${b.trafficLeaders
                  .map(
                    (tl) => `<div class="space-y-1 pl-1">
                  <div class="flex items-center justify-between text-[11px]">
                    <span class="font-semibold text-zinc-900">${esc(tl.name)}</span>
                    <span class="text-emerald-700 font-medium">${esc(tl.trafficSignal)}</span>
                  </div>
                  <ul class="list-disc list-inside text-zinc-600 text-[11px] space-y-0.5">
                    ${tl.keySuccessFactors.map((f) => `<li>${esc(f)}</li>`).join("")}
                  </ul>
                </div>`,
                  )
                  .join("")}
              </div>

              <!-- Formule de Conversion & Badges -->
              <div class="space-y-2 text-xs">
                <div class="space-y-1">
                  <span class="font-semibold text-zinc-700 text-[11px] uppercase tracking-wider block">Formule d'accroche Hero :</span>
                  <p class="text-zinc-800 font-medium bg-white p-2.5 rounded-lg border border-zinc-200 text-xs italic">
                    « ${esc(b.conversionBlueprint.hero.headlinePattern)} »
                  </p>
                </div>

                <div class="space-y-1">
                  <span class="font-semibold text-zinc-700 text-[11px] uppercase tracking-wider block">4 Badges de confiance incontournables :</span>
                  <div class="flex flex-wrap gap-1.5">
                    ${b.conversionBlueprint.hero.trustBadges
                      .map(
                        (badge) => `<span class="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 border border-emerald-200/80 px-2 py-0.5 rounded-md text-[11px] font-semibold">
                      ${icon("shield", "w-3 h-3 text-emerald-600")}
                      <span>${esc(badge)}</span>
                    </span>`,
                      )
                      .join("")}
                  </div>
                </div>

                <div class="space-y-1 pt-1">
                  <span class="font-semibold text-zinc-700 text-[11px] uppercase tracking-wider block">Prestations cibles (${b.conversionBlueprint.servicesGrid.servicesList.length}) :</span>
                  <ul class="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px] text-zinc-600">
                    ${b.conversionBlueprint.servicesGrid.servicesList
                      .map(
                        (s) => `<li class="flex items-center gap-1.5 truncate">
                      ${icon("check", "w-3 h-3 text-indigo-500 shrink-0")}
                      <span class="truncate">${esc(s)}</span>
                    </li>`,
                      )
                      .join("")}
                  </ul>
                </div>

                <div class="space-y-1 pt-1 border-t border-zinc-100">
                  <span class="font-semibold text-zinc-700 text-[11px] uppercase tracking-wider block">Pattern Mobile & Dépannage Immédiat :</span>
                  <div class="flex items-center gap-1.5 text-zinc-700 text-[11px]">
                    ${icon("phone", "w-3 h-3 text-emerald-600 shrink-0")}
                    <span class="font-semibold text-emerald-700">${esc(b.conversionBlueprint.mobileWinningPattern.emergencyTagline)}</span>
                    <span class="text-zinc-400">·</span>
                    <span class="text-zinc-500">Barre sticky fixe avec bouton d'appel direct en bas d'écran</span>
                  </div>
                </div>
              </div>
            </div>`;
          }).join("")}
        </div>
      </div>
    </div>`
      : ""
  }

  ${
    /* ========================================================================= */
    /* ONGLET 4 : ÉQUIPE & CLOSERS                                              */
    /* ========================================================================= */
    tab === "team"
      ? `<section class="${card} space-y-4">
      <div class="border-b border-zinc-100 pb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 class="font-semibold text-sm text-zinc-900 flex items-center gap-2">${icon("users", "w-4 h-4 text-zinc-700")} Liste Blanche (Whitelist) & Gestion de l'Équipe</h2>
          <p class="text-xs text-zinc-500">Seules les adresses email listées ici et actives peuvent se connecter (via Google ou Mot de passe). Envoyez une invitation par mail en 1 clic.</p>
        </div>
        <span class="text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-lg">🔒 Zéro inscription publique</span>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-xs sm:text-sm">
          <thead><tr class="text-left text-zinc-500 border-b pb-2 text-xs">
            <th class="py-2">Utilisateur</th><th>Email Autorisé (Whitelist)</th><th>Rôle & Mot de passe</th><th>Opportunités Activées</th><th>Invitation & Statut</th>
          </tr></thead>
          <tbody class="divide-y divide-zinc-100 text-xs">
          ${users
            .map(
              (u) => {
                const userOpps = parseAllowedOpportunities(u.allowed_opportunities);
                const hasPwd = !!u.password_hash;
                const invCode = u.invite_code || "";
                const userEmail = u.email || "";
                return `<tr class="hover:bg-zinc-50">
            <td class="py-3 font-semibold text-zinc-900">
              <div class="flex items-center gap-2">
                <span class="w-7 h-7 rounded-full bg-zinc-200 flex items-center justify-center font-bold text-zinc-700 text-xs shrink-0">${esc(u.name.slice(0, 2).toUpperCase())}</span>
                <div>
                  <span class="block">${esc(u.name)}</span>
                  <span class="text-[10px] text-zinc-400 font-normal">${u.phone_quota_weekly} appels/sem.</span>
                </div>
              </div>
            </td>
            <td class="py-3">
              <div class="flex items-center gap-1.5">
                <input data-email-input="${esc(u.id)}" type="email" value="${esc(userEmail)}" placeholder="email@domaine.com" class="border border-zinc-200 rounded-md px-2 py-1 text-xs font-mono text-zinc-800 bg-white w-48 focus:ring-1 focus:ring-indigo-500">
                <button type="button" data-save-email="${esc(u.id)}" class="text-[11px] bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-semibold px-2 py-1 rounded border border-zinc-200 transition-colors" title="Enregistrer l'email">Sauver</button>
              </div>
            </td>
            <td class="py-3">
              <div class="flex flex-col gap-1 items-start">
                <span class="px-2 py-0.5 rounded text-[11px] font-semibold ${u.role === "admin" ? "bg-purple-100 text-purple-800" : "bg-blue-100 text-blue-800"}">${esc(u.role)}</span>
                <span class="text-[10px] font-medium ${hasPwd ? "text-emerald-700" : "text-amber-600"}">${hasPwd ? "✔ Mot de passe actif" : "⏳ En attente d'activation"}</span>
              </div>
            </td>
            <td class="py-3">
              ${u.role === "closer" ? `
                <div class="flex flex-wrap gap-1 max-w-xs">
                  ${OPPORTUNITY_TYPES.map((ot) => {
                    const active = (userOpps as string[]).includes(ot.id);
                    return `<button type="button" data-user-opp="${esc(u.id)}" data-opp-id="${ot.id}" data-active="${active ? "1" : "0"}" class="btn-toggle-opp text-[11px] px-2 py-0.5 rounded border transition-colors font-medium ${active ? "bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100" : "bg-zinc-100 border-zinc-200 text-zinc-400 hover:text-zinc-600 line-through"}">${esc(ot.badge)}</button>`;
                  }).join("")}
                </div>
                <div class="flex flex-wrap gap-1 max-w-xs mt-1.5" title="Canaux traités (attribution automatique)">
                  ${CHANNEL_IDS.map((ch) => {
                    const active = (parseAllowedChannels(u.allowed_channels) as string[]).includes(ch);
                    return `<button type="button" data-user-ch="${esc(u.id)}" data-ch-id="${ch}" data-active="${active ? "1" : "0"}" class="btn-toggle-ch text-[11px] px-2 py-0.5 rounded border transition-colors font-medium ${active ? "bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100" : "bg-zinc-100 border-zinc-200 text-zinc-400 hover:text-zinc-600 line-through"}">${esc(CHANNEL_LABELS[ch])}</button>`;
                  }).join("")}
                </div>
              ` : `<span class="text-xs text-zinc-400 font-medium">Tous les besoins (Admin)</span>`}
            </td>
            <td class="py-3">
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="px-2 py-0.5 rounded text-[11px] font-semibold ${u.is_active ? "bg-emerald-100 text-emerald-800" : "bg-zinc-200 text-zinc-600"}">${u.is_active ? "Autorisé" : "Bloqué"}</span>
                ${invCode ? `
                  <button type="button" data-invite-mail="${esc(userEmail)}" data-invite-name="${esc(u.name)}" data-invite-code="${esc(invCode)}" class="btn-send-invite text-[11px] bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-md px-2 py-1 font-semibold transition-colors" title="Ouvrir votre boîte mail avec l'invitation pré-remplie">✉️ Inviter par mail</button>
                  <button type="button" data-copy-invite="${esc(invCode)}" class="btn-copy-invite text-[11px] bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-200 rounded-md px-2 py-1 font-semibold transition-colors" title="Copier le lien d'activation / réinitialisation mot de passe">🔗 Lien</button>
                ` : ""}
                ${u.id !== user.id ? `<button data-toggle="${esc(u.id)}" class="text-[11px] border border-zinc-200 rounded-md px-2 py-1 font-semibold hover:bg-zinc-100">${u.is_active ? "Bloquer" : "Réautoriser"}</button>` : `<span class="text-[11px] text-zinc-400 font-medium">(Vous)</span>`}
              </div>
            </td>
          </tr>`;
              }
            )
            .join("")}
          </tbody>
        </table>
      </div>

      <div class="pt-4 border-t border-zinc-100 space-y-3">
        <h3 class="font-semibold text-xs text-zinc-900 uppercase tracking-wider">Inviter & Autoriser une nouvelle personne dans la Whitelist</h3>
        <div class="grid sm:grid-cols-4 gap-2">
          <input id="newname" placeholder="Prénom & Nom (ex: Sophie)" class="border border-zinc-200 rounded-lg px-3 py-2 text-xs bg-white focus:ring-1 focus:ring-zinc-900">
          <input id="newemail" type="email" placeholder="Email autorisé (ex: sophie@gmail.com)" class="border border-zinc-200 rounded-lg px-3 py-2 text-xs bg-white font-mono focus:ring-1 focus:ring-zinc-900 sm:col-span-2">
          <div class="flex items-center gap-2">
            <input id="newquota" type="number" placeholder="Quota" value="100" class="border border-zinc-200 rounded-lg px-3 py-2 text-xs w-20 bg-white focus:ring-1 focus:ring-zinc-900" title="Quota appels hebdomadaire">
            <button id="adduser" class="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-3 py-2 text-xs font-semibold shadow-sm whitespace-nowrap">Autoriser & Inviter</button>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2 pt-1">
          <span class="text-xs text-zinc-600 font-medium">Besoins autorisés :</span>
          ${OPPORTUNITY_TYPES.map((ot) => `
            <label class="inline-flex items-center gap-1.5 text-xs text-zinc-700 font-medium bg-zinc-50 border border-zinc-200 rounded px-2.5 py-1 cursor-pointer hover:bg-zinc-100 select-none">
              <input type="checkbox" name="new_closer_opp" value="${ot.id}" checked class="rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500">
              <span>${esc(ot.badge)}</span>
            </label>
          `).join("")}
        </div>
        <div id="newtoken" class="text-xs font-medium text-emerald-800"></div>
      </div>
    </section>`
      : ""
  }

  ${
    /* ========================================================================= */
    /* ONGLET 5 : ATTRIBUTION DES LEADS                                         */
    /* ========================================================================= */
    tab === "attribution"
      ? `<section class="${card} space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 pb-3">
        <div>
          <h2 class="font-semibold text-sm text-zinc-900 flex items-center gap-2">${icon("layers", "w-4 h-4 text-zinc-700")} Attribution & Répartition des Leads</h2>
          <p class="text-xs text-zinc-500">Distribuez automatiquement les nouveaux leads ou réassignez-les individuellement.</p>
        </div>
        <button id="rr" class="text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-4 py-2 font-semibold shadow-sm transition-all inline-flex items-center gap-1.5">
          ${icon("refresh", "w-3.5 h-3.5")} Round-robin sur les non assignés
        </button>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-xs sm:text-sm">
          <thead><tr class="text-left text-zinc-500 border-b pb-2 text-xs">
            <th class="py-2">Société & Ville</th><th>Statut</th><th>Vues Démo</th><th>Attribué à</th>
          </tr></thead>
          <tbody class="divide-y divide-zinc-100 text-xs">
          ${leads
            .map(
              (l) => `<tr class="hover:bg-zinc-50">
            <td class="py-3">
              <span class="font-semibold text-zinc-900 block">${esc(l.company_name)}</span>
              <span class="text-xs text-zinc-500">${esc(l.activity)} · ${esc(l.city)}</span>
            </td>
            <td class="py-3">${formatStatusPill(l.status)}</td>
            <td class="py-3 font-mono font-medium">${l.demo_viewed_count > 0 ? `<span class="text-rose-600 font-semibold inline-flex items-center gap-1">${icon("flame", "w-3 h-3 text-rose-500")} ${l.demo_viewed_count}</span>` : `<span class="text-zinc-400">0</span>`}</td>
            <td class="py-3">
              <select data-assign="${esc(l.id)}" class="border border-zinc-200 rounded-md px-2.5 py-1.5 text-xs bg-white text-zinc-800 font-medium">
                <option value="">— Non assigné —</option>
                ${closers.map((u) => `<option value="${esc(u.id)}" ${l.assigned_to === u.id ? "selected" : ""}>${esc(u.name)}</option>`).join("")}
              </select>
            </td>
          </tr>`,
            )
            .join("")}
          </tbody>
        </table>
      </div>
    </section>`
      : ""
  }

  </main>
</div>

<script>
var $ = function (id) { return document.getElementById(id); };
document.querySelectorAll('[data-opp-pick]').forEach(function (r) {
  r.addEventListener('change', function () { if (r.checked && $(r.dataset.oppPick)) $(r.dataset.oppPick).value = r.value; });
});
function post(url, body) { return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }); }

${hasActive && tab !== "needs" ? "setTimeout(function () { location.reload(); }, 8000);" : ""}

// Initialisation Carte Leaflet (si onglet scanner)
function initLeafletMap() {
  if (!$('map')) return;
  if (typeof L === 'undefined') {
    setTimeout(initLeafletMap, 100);
    return;
  }
  var initLat = 43.1158;
  var initLng = 1.6112;
  var initRadius = 5;

  var map = L.map('map').setView([initLat, initLng], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  }).addTo(map);

  var marker = L.marker([initLat, initLng], { draggable: true }).addTo(map);
  var circle = L.circle([initLat, initLng], {
    radius: initRadius * 1000,
    color: '#4f46e5',
    fillColor: '#818cf8',
    fillOpacity: 0.25
  }).addTo(map);

  setTimeout(function () { map.invalidateSize(); }, 200);

  function updateZone(lat, lng, radiusKm, skipGeocode) {
    $('lat').value = lat.toFixed(5);
    $('lng').value = lng.toFixed(5);
    $('radius_km').value = radiusKm;
    $('zone_coords').textContent = lat.toFixed(3) + ', ' + lng.toFixed(3);
    $('radius_val').textContent = radiusKm + ' km';
    marker.setLatLng([lat, lng]);
    circle.setLatLng([lat, lng]);
    circle.setRadius(radiusKm * 1000);

    if (!skipGeocode) {
      fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat=' + lat + '&lon=' + lng)
        .then(function(r) { return r.json(); })
        .then(function(data) {
          if (data && data.address) {
            var city = data.address.city || data.address.town || data.address.village || data.address.municipality || 'Zone locale';
            $('c').value = city;
            $('zone_name').textContent = city + (data.address.postcode ? ' (' + data.address.postcode + ')' : '');
          }
        }).catch(function() {});
    }
  }

  map.on('click', function(e) {
    updateZone(e.latlng.lat, e.latlng.lng, Number($('radius_slider').value) || 5);
  });

  marker.on('dragend', function() {
    var pos = marker.getLatLng();
    updateZone(pos.lat, pos.lng, Number($('radius_slider').value) || 5);
  });

  $('radius_slider').oninput = function() {
    var r = Number(this.value) || 5;
    $('radius_val').textContent = r + ' km';
    circle.setRadius(r * 1000);
    $('radius_km').value = r;
  };

  $('btn_search_map').onclick = async function() {
    var q = $('mapsearch').value.trim();
    if (!q) return;
    try {
      var res = await fetch('https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(q));
      var items = await res.json();
      if (items && items.length > 0) {
        var lat = parseFloat(items[0].lat);
        var lon = parseFloat(items[0].lon);
        map.setView([lat, lon], 13);
        updateZone(lat, lon, Number($('radius_slider').value) || 5);
      }
    } catch(e) {}
  };

  $('mapsearch').onkeydown = function(e) {
    if (e.key === 'Enter') { e.preventDefault(); $('btn_search_map').click(); }
  };

  if ($('btn_geo')) {
    $('btn_geo').onclick = function() {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function(pos) {
          var lat = pos.coords.latitude;
          var lon = pos.coords.longitude;
          map.setView([lat, lon], 14);
          updateZone(lat, lon, Number($('radius_slider').value) || 5);
        });
      }
    };
  }

  // Presets selector
  document.querySelectorAll('.preset-btn').forEach(function(b) {
    b.onclick = function() {
      document.querySelectorAll('.preset-btn').forEach(function(x) {
        x.className = 'preset-btn text-xs px-3 py-1.5 rounded-lg border font-semibold transition-all bg-white hover:bg-zinc-50 border-zinc-200 text-zinc-700';
      });
      b.className = 'preset-btn text-xs px-3 py-1.5 rounded-lg border font-semibold transition-all bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm';
      $('q').value = b.dataset.preset;
      if (b.dataset.opp && $('opp_type')) {
        var pick = document.querySelector('input[name="opp_type_pick"][value="' + b.dataset.opp + '"]');
        if (pick) { pick.checked = true; $('opp_type').value = b.dataset.opp; }
      }
    };
  });
}
initLeafletMap();

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function setStepClass(id, active) {
  var el = $(id);
  if (!el) return;
  if (active) {
    el.className = 'rounded-xl px-2.5 py-2 border transition-all bg-indigo-600/30 border-indigo-400 text-white font-bold ring-1 ring-indigo-400';
  } else {
    el.className = 'rounded-xl px-2.5 py-2 border transition-all bg-zinc-900 border-zinc-800 text-zinc-400';
  }
}

function updateScanUI(scans) {
  if (!scans || !scans.length) return;
  var active = scans.find(function (s) { return s.status === 'running' || s.status === 'queued'; });
  var card = $('live_scan_card');

  if (active && card) {
    card.classList.remove('hidden');
    var isRunning = active.status === 'running';
    var total = active.total || active.lead_limit || 0;
    var processed = active.processed || 0;
    var pct = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : (isRunning ? 15 : 0);
    var msg = active.message || (isRunning ? "Traitement par le worker local sur Mac..." : "En attente du worker local...");

    var badgeEl = $('live_scan_badge');
    if (badgeEl) {
      badgeEl.textContent = isRunning ? "Scan en cours d'exécution" : "Job en file d'attente";
      badgeEl.className = 'text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-md ' +
        (isRunning ? "text-cyan-300 bg-cyan-950/80 border border-cyan-800" : "text-amber-300 bg-amber-950/80 border border-amber-800");
    }

    var stepLabel = $('live_scan_step_label');
    if (stepLabel) stepLabel.textContent = isRunning ? "Opération en cours sur le prospect :" : "En attente :";

    // Extraction et mise à jour des potentiels repérés
    var potMatch = msg.match(/(\d+)\s+potentiels/);
    var isMaps = msg.indexOf("Étape 1") !== -1 || msg.indexOf("Maps") !== -1 || msg.indexOf("Cartographie") !== -1 || msg.indexOf("Recherche") !== -1 || msg.indexOf("Collecte") !== -1;
    var potCount = potMatch ? (potMatch[1] + " fiches") : (isMaps ? "En exploration..." : "-");
    var potEl = $('live_scan_potentials');
    if (potEl) potEl.textContent = potCount;

    var counter = $('live_scan_counter');
    if (counter) counter.textContent = processed + " / " + (total > 0 ? total : active.lead_limit);

    var pctEl = $('live_scan_pct');
    if (pctEl) pctEl.textContent = pct + "%";

    var msgEl = $('live_scan_msg');
    if (msgEl) msgEl.textContent = msg;

    var bar = $('live_scan_bar');
    if (bar) {
      bar.style.width = (total > 0 ? pct : (isRunning ? 30 : 5)) + "%";
    }

    var statusText = $('live_scan_status_text');
    if (statusText) {
      statusText.textContent = isRunning ? "Worker local actif sur votre Mac" : "En attente de prise en charge par le worker";
    }

    // Highlighting current step
    var isInspection = msg.indexOf("Inspection") !== -1 || msg.indexOf("Audit") !== -1 || msg.indexOf("site") !== -1;
    var isDemo = msg.indexOf("Tailwind") !== -1 || msg.indexOf("démo") !== -1 || msg.indexOf("Génération") !== -1;
    var isFlyer = msg.indexOf("Flyer") !== -1 || msg.indexOf("Battlecard") !== -1 || msg.indexOf("Pitch") !== -1;
    var isSync = msg.indexOf("Envoi") !== -1 || msg.indexOf("Cloud") !== -1 || msg.indexOf("synchronisé") !== -1 || msg.indexOf("terminé") !== -1;

    setStepClass('step_maps', isMaps);
    setStepClass('step_audit', isInspection);
    setStepClass('step_demo', isDemo);
    setStepClass('step_flyer', isFlyer);
    setStepClass('step_sync', isSync);
  } else if (!active && card) {
    var latest = scans[0];
    if (latest && latest.status === 'done') {
      var counter = $('live_scan_counter');
      if (counter) counter.textContent = (latest.processed || 0) + " / " + (latest.total || latest.lead_limit || latest.processed);
      var msgEl = $('live_scan_msg');
      if (msgEl) msgEl.textContent = "Scan terminé : " + (latest.message || (latest.processed + " leads ajoutés avec succès !"));
      var bar = $('live_scan_bar');
      if (bar) bar.style.width = "100%";
      setStepClass('step_sync', true);
      var btn = $('launch');
      if (btn) {
        btn.disabled = false;
        btn.className = 'text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-5 py-2 font-semibold shadow-sm transition-colors inline-flex items-center gap-1.5';
      }
    }
  }

  // Update table
  var tbody = $('scans_tbody');
  if (tbody) {
    var badgeClasses = {
      queued: 'bg-zinc-100 text-zinc-700',
      running: 'bg-blue-100 text-blue-700 animate-pulse font-semibold',
      done: 'bg-emerald-100 text-emerald-800 font-semibold',
      failed: 'bg-rose-100 text-rose-800 font-semibold',
      cancelled: 'bg-amber-100 text-amber-800'
    };
    var oppList = ${JSON.stringify(OPPORTUNITY_TYPES)};
    var rowsHtml = '';
    scans.forEach(function (s) {
      var oppKey = s.opportunity_type || ${JSON.stringify(DEFAULT_OPPORTUNITY_ID)};
      var o = oppList.find(function (x) { return x.id === oppKey; }) || { badge: '🎯 ' + oppKey };
      var filterTag = s.website_filter && s.website_filter !== 'all' ? ' <span class="text-[9px] opacity-75">(' + (s.website_filter === 'no_website' ? 'sans site' : 'avec site') + ')</span>' : '';
      var isGen = s.job_type === 'generate';
      var modeBadge = s.mode_badge || '';
      rowsHtml += '<tr class="hover:bg-zinc-50">' +
        '<td class="py-3 font-mono font-bold text-zinc-400">' + s.id + '</td>' +
        '<td class="py-3 font-semibold text-zinc-800">' + escHtml(s.query) + ' · ' + escHtml(s.city) + (isGen ? '' : ' <span class="text-xs text-zinc-400 font-normal">(' + s.lead_limit + ' max' + (s.use_cdp ? ', CDP' : '') + ')</span>') + '</td>' +
        '<td class="py-3">' + (isGen ? '<span class="text-zinc-400">—</span>' : '<span class="px-2 py-0.5 rounded text-[11px] font-semibold border bg-indigo-50 text-indigo-700 border-indigo-200">' + escHtml(o.badge) + filterTag + '</span>') + '</td>' +
        '<td class="py-3">' + modeBadge + '</td>' +
        '<td class="py-3"><span class="px-2.5 py-0.5 rounded-md text-xs font-semibold ' + (badgeClasses[s.status] || '') + '">' + escHtml(s.status) + '</span></td>' +
        '<td class="py-3 font-mono text-zinc-700 font-medium">' + s.processed + '/' + (s.total || '?') + '</td>' +
        '<td class="py-3 text-xs text-zinc-500 max-w-xs truncate" title="' + escHtml(s.message || '') + '">' + escHtml(s.message || '–') + '</td>' +
        '<td class="py-3 flex items-center gap-1.5 whitespace-nowrap">' +
          (s.status === 'queued' || s.status === 'running' ? '<button data-cancel="' + s.id + '" class="text-xs bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 rounded-md px-2.5 py-1 font-semibold">Annuler</button>' : '<span class="text-xs text-zinc-400 font-medium">Terminé</span>') +
          ' <button type="button" class="btn-view-scan-logs text-xs bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-200 rounded-md px-2 py-1 font-semibold inline-flex items-center gap-1 shadow-sm transition-colors" data-scan-id="' + s.id + '" data-scan-title="' + escHtml(s.query) + ' · ' + escHtml(s.city) + '">📋 Logs</button>' +
        '</td>' +
        '</tr>';
    });
    tbody.innerHTML = rowsHtml;
  }
}

var scanPollTimer = null;
function pollScansOnce() {
  fetch('/api/admin/scans')
    .then(function (r) { return r.json(); })
    .then(function (scans) { updateScanUI(scans); })
    .catch(function () {});
}

function startScanPolling() {
  if (scanPollTimer) return;
  scanPollTimer = setInterval(pollScansOnce, 2500);
}

if (${hasActive}) {
  startScanPolling();
}

// Gestion de l'affichage du formulaire de création de programmation
if ($('btn_toggle_new_schedule')) {
  $('btn_toggle_new_schedule').onclick = function () {
    var box = $('new_schedule_box');
    if (box) box.classList.toggle('hidden');
  };
}
if ($('btn_cancel_schedule')) {
  $('btn_cancel_schedule').onclick = function () {
    var box = $('new_schedule_box');
    if (box) box.classList.add('hidden');
  };
}

if ($('btn_save_schedule')) {
  $('btn_save_schedule').onclick = async function () {
    var btn = $('btn_save_schedule');
    var msg = $('sched_msg');
    btn.disabled = true;
    btn.textContent = 'Enregistrement…';
    if (msg) msg.textContent = '';

    try {
      var schedExecModeRadio = document.querySelector('input[name="sched_exec_mode"]:checked');
      var schedExecMode = schedExecModeRadio ? schedExecModeRadio.value : 'full_auto';
      var r = await post('/api/admin/scheduled-scans', {
        label: $('sched_label').value,
        time_of_day: $('sched_time').value,
        days_of_week: $('sched_days').value,
        query: $('sched_q').value,
        city: $('sched_c').value,
        limit: Number($('sched_n').value) || 10,
        opportunity_type: $('sched_opp').value,
        website_filter: 'all',
        execution_mode: schedExecMode,
        cdp: $('sched_cdp').checked,
        lat: $('lat') ? Number($('lat').value) : null,
        lng: $('lng') ? Number($('lng').value) : null,
        radius_km: $('radius_km') ? Number($('radius_km').value) : null
      });
      if (r.ok) {
        location.reload();
      } else {
        var j = await r.json();
        if (msg) {
          msg.textContent = 'Erreur : ' + (j.error || "Impossible d'enregistrer");
          msg.className = 'text-xs text-rose-600 font-semibold';
        }
        btn.disabled = false;
        btn.textContent = 'Enregistrer la Planification';
      }
    } catch (e) {
      if (msg) {
        msg.textContent = 'Erreur réseau';
        msg.className = 'text-xs text-rose-600 font-semibold';
      }
      btn.disabled = false;
      btn.textContent = 'Enregistrer la Planification';
    }
  };
}

// Actions sur les programmations (Pause/Actif, Lancer maintenant, Supprimer)
document.addEventListener('click', async function (e) {
  var tBtn = e.target.closest('[data-sched-toggle]');
  if (tBtn) {
    tBtn.disabled = true;
    await post('/api/admin/scheduled-scans/' + tBtn.dataset.schedToggle + '/toggle');
    location.reload();
    return;
  }
  var rBtn = e.target.closest('[data-sched-run]');
  if (rBtn) {
    rBtn.disabled = true;
    rBtn.textContent = 'Lancement…';
    var res = await post('/api/admin/scheduled-scans/' + rBtn.dataset.schedRun + '/run-now');
    if (res.ok) {
      startScanPolling();
      pollScansOnce();
      var card = $('live_scan_card');
      if (card) {
        card.classList.remove('hidden');
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } else {
      alert("Erreur lors du déclenchement immédiat.");
      rBtn.disabled = false;
      rBtn.textContent = '⚡ Lancer';
    }
    return;
  }
  var dBtn = e.target.closest('[data-sched-delete]');
  if (dBtn) {
    if (!confirm('Voulez-vous vraiment supprimer cette programmation récurrente ?')) return;
    dBtn.disabled = true;
    await post('/api/admin/scheduled-scans/' + dBtn.dataset.schedDelete + '/delete');
    location.reload();
    return;
  }
});

// Lancement du scan
if ($('launch')) {
  $('launch').onclick = async function () {
    var btn = $('launch');
    var msg = $('launchmsg');
    btn.disabled = true;
    btn.className = 'text-xs bg-zinc-400 text-white rounded-lg px-5 py-2 font-semibold cursor-not-allowed inline-flex items-center gap-1.5';
    msg.textContent = 'Envoi du job au worker local…';
    msg.className = 'text-xs text-blue-600 font-semibold';

    try {
      var execModeRadio = document.querySelector('input[name="execution_mode"]:checked');
      var execMode = execModeRadio ? execModeRadio.value : 'full_auto';
      var r = await post('/api/admin/scans', {
        query: $('q').value,
        city: $('c').value,
        limit: Number($('n').value) || 10,
        cdp: $('cdp').checked,
        lat: $('lat') ? Number($('lat').value) : null,
        lng: $('lng') ? Number($('lng').value) : null,
        radius_km: $('radius_km') ? Number($('radius_km').value) : null,
        opportunity_type: $('opp_type') ? $('opp_type').value : ${JSON.stringify(DEFAULT_OPPORTUNITY_ID)},
        website_filter: 'all',
        execution_mode: execMode
      });
      if (r.ok) {
        msg.textContent = 'Job transmis ! Prise en charge par le worker…';
        msg.className = 'text-xs text-emerald-600 font-semibold';
        startScanPolling();
        pollScansOnce();
        var card = $('live_scan_card');
        if (card) {
          card.classList.remove('hidden');
          card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      } else {
        var errBody = await r.json().catch(function () { return {}; });
        msg.textContent = errBody.message || 'Erreur lors du lancement du scan';
        msg.className = 'text-xs text-rose-600 font-semibold';
        btn.disabled = false;
        btn.className = 'text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-5 py-2 font-semibold shadow-sm transition-colors inline-flex items-center gap-1.5';
      }
    } catch (e) {
      msg.textContent = 'Erreur réseau';
      msg.className = 'text-xs text-rose-600 font-semibold';
      btn.disabled = false;
      btn.className = 'text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-5 py-2 font-semibold shadow-sm transition-colors inline-flex items-center gap-1.5';
    }
  };
}

// Annulation d'un scan avec délégation d'événement
var curActiveScanLogId = null;
async function fetchAndDisplayScanLogs(scanId) {
  var contentEl = $('scan_logs_content');
  if (!contentEl) return;
  contentEl.textContent = 'Chargement des logs en direct...';
  try {
    var res = await fetch('/api/admin/scans/' + scanId + '/logs');
    var j = await res.json();
    if (j.ok) {
      contentEl.textContent = j.logs || 'Aucun log détaillé enregistré pour ce scan.';
      contentEl.scrollTop = contentEl.scrollHeight;
    } else {
      contentEl.textContent = 'Erreur : ' + (j.error || 'introuvable');
    }
  } catch (err) {
    contentEl.textContent = 'Erreur réseau : ' + err.message;
  }
}

document.addEventListener('click', async function (e) {
  var genBtn = e.target.closest('.btn-gen-api');
  if (genBtn) {
    var ids = genBtn.dataset.genId ? [genBtn.dataset.genId] : null;
    var all = ids ? null : document.querySelectorAll('.btn-gen-api[data-gen-id]');
    var label = genBtn.textContent;
    genBtn.disabled = true;
    genBtn.textContent = 'Envoi…';
    var msg = $('gen_api_msg');
    try {
      var r = await post('/api/admin/leads/generate-api', ids ? { lead_ids: ids } : {});
      var data = await r.json().catch(function () { return {}; });
      if (!r.ok) throw new Error(data.message || ('Erreur ' + r.status));
      var done = ids ? [genBtn] : Array.prototype.slice.call(all);
      done.forEach(function (btn) {
        btn.outerHTML = '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-violet-50 border border-violet-200 text-violet-700"><span class="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse"></span>API en cours</span>';
      });
      if (!ids) genBtn.remove();
      if (msg) {
        msg.className = 'mt-3 text-xs rounded-lg px-3 py-2 bg-violet-50 text-violet-800 border border-violet-200';
        msg.textContent = 'Job #' + data.id + ' créé pour ' + data.count + " lead(s). Le worker du Mac s'en charge : suivi et logs dans l'onglet Scanner.";
      }
    } catch (err) {
      genBtn.disabled = false;
      genBtn.textContent = label;
      if (msg) {
        msg.className = 'mt-3 text-xs rounded-lg px-3 py-2 bg-rose-50 text-rose-800 border border-rose-200';
        msg.textContent = err.message;
      }
    }
    return;
  }

  var b = e.target.closest('[data-cancel]');
  if (b) {
    b.disabled = true;
    b.textContent = 'Annulation…';
    await post('/api/admin/scans/' + b.dataset.cancel + '/cancel');
    pollScansOnce();
    return;
  }

  var logBtn = e.target.closest('.btn-view-scan-logs');
  if (logBtn) {
    curActiveScanLogId = logBtn.dataset.scanId;
    var modal = $('scan_logs_modal');
    if (modal) {
      modal.classList.remove('hidden');
      $('scan_logs_title').textContent = "📋 Journal d'exécution du Scan #" + curActiveScanLogId + " — " + (logBtn.dataset.scanTitle || "");
      fetchAndDisplayScanLogs(curActiveScanLogId);
    }
    return;
  }
});

if ($('btn_refresh_cur_logs')) {
  $('btn_refresh_cur_logs').onclick = function () {
    if (curActiveScanLogId) fetchAndDisplayScanLogs(curActiveScanLogId);
  };
}

var ALL_MODELS = ${JSON.stringify(availableModels)};

function updateModelInfoCard(target, modelId) {
  var m = ALL_MODELS.find(function (x) { return x.model_id === modelId; });
  var speedBadge = $('badge_speed_' + target);
  var costBadge = $('badge_cost_' + target);
  var ctxBadge = $('badge_ctx_' + target);
  var visionBadge = $('badge_vision_' + target);
  var thinkingBadge = $('badge_thinking_' + target);
  var descEl = $('desc_' + target);

  if (m) {
    if (speedBadge) {
      speedBadge.textContent = m.speed === 'ultra' ? 'Ultra-rapide (~1s)' : m.speed === 'deep' ? 'Réflexion (~5-8s)' : 'Rapide (~2-3s)';
      speedBadge.className = 'px-2 py-0.5 rounded-md border text-[11px] ' + (m.speed === 'ultra' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : m.speed === 'deep' ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-blue-50 text-blue-700 border-blue-200');
    }
    if (costBadge) {
      costBadge.textContent = m.cost_tier === 'eco' ? 'Très économique' : m.cost_tier === 'premium' ? 'Premium' : 'Standard';
      costBadge.className = 'px-2 py-0.5 rounded-md border text-[11px] ' + (m.cost_tier === 'eco' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : m.cost_tier === 'premium' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-zinc-100 text-zinc-700 border-zinc-200');
    }
    if (ctxBadge) {
      ctxBadge.textContent = m.context_window || '1M tokens';
    }
    if (visionBadge) {
      visionBadge.className = m.supports_vision ? 'px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-700 text-[11px]' : 'hidden';
    }
    if (thinkingBadge) {
      thinkingBadge.className = m.supports_thinking ? 'px-2 py-0.5 rounded-md bg-purple-50 border border-purple-200 text-purple-700 text-[11px]' : 'hidden';
    }
    if (descEl) {
      descEl.textContent = m.description || 'Modèle configuré.';
    }
  } else {
    if (descEl) descEl.textContent = 'Modèle personnalisé renseigné manuellement.';
  }
}

// Gestion dynamique des sélecteurs de modèles
document.querySelectorAll('.prov-select').forEach(function (ps) {
  ps.onchange = function () {
    var target = ps.dataset.target;
    var prov = ps.value;
    var sel = $('sel_mod_' + target);
    var input = $('mod_' + target);
    var wrap = $('custom_wrap_' + target);
    if (!sel || !input) return;

    var filtered = ALL_MODELS.filter(function (m) { return m.provider === prov; });
    if (filtered.length === 0 && prov === 'cloudflare') {
      filtered = [
        { provider: 'cloudflare', model_id: '@cf/meta/llama-3.1-8b-instruct-fp8', display_name: 'Meta Llama 3.1 8B FP8 (Cloudflare Workers AI - 0€)', is_flagship: 1, speed: 'ultra', cost_tier: 'eco' },
        { provider: 'cloudflare', model_id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', display_name: 'Meta Llama 3.3 70B Fast (Cloudflare Workers AI)', is_flagship: 1, speed: 'fast', cost_tier: 'standard' },
        { provider: 'cloudflare', model_id: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', display_name: 'DeepSeek R1 32B (Cloudflare Workers AI)', is_flagship: 1, speed: 'deep', cost_tier: 'standard' }
      ];
    }
    var flagships = filtered.filter(function (m) { return m.is_flagship !== 0; });
    var others = filtered.filter(function (m) { return m.is_flagship === 0; });

    var html = '';
    var renderOpt = function (m) {
      var speedLabel = m.speed === 'ultra' ? '[Ultra]' : m.speed === 'deep' ? '[Deep]' : '[Rapide]';
      var costLabel = m.cost_tier === 'eco' ? '[Eco]' : m.cost_tier === 'premium' ? '[Premium]' : '[Std]';
      return '<option value="' + m.model_id + '">' + speedLabel + ' ' + costLabel + ' ' + m.display_name + '</option>';
    };

    if (flagships.length > 0) {
      html += '<optgroup label="Modèles Phares Recommandés">';
      flagships.forEach(function (m) { html += renderOpt(m); });
      html += '</optgroup>';
    }
    if (others.length > 0) {
      html += '<optgroup label="Déclinaisons Secondaires & Snapshots">';
      others.forEach(function (m) { html += renderOpt(m); });
      html += '</optgroup>';
    }
    html += '<optgroup label="Saisie manuelle"><option value="__custom__">Saisie personnalisée / autre...</option></optgroup>';
    sel.innerHTML = html;

    if (filtered.length > 0) {
      var pick = flagships.length > 0 ? flagships[0].model_id : filtered[0].model_id;
      sel.value = pick;
      input.value = pick;
      if (wrap) wrap.className = 'hidden';
      updateModelInfoCard(target, pick);
    } else {
      sel.value = '__custom__';
      if (wrap) wrap.className = '';
    }
  };
});

document.querySelectorAll('.mod-select').forEach(function (ms) {
  ms.onchange = function () {
    var target = ms.dataset.target;
    var input = $('mod_' + target);
    var wrap = $('custom_wrap_' + target);
    if (ms.value === '__custom__') {
      if (wrap) wrap.className = '';
      if (input) input.focus();
    } else {
      if (wrap) wrap.className = 'hidden';
      if (input) input.value = ms.value;
      updateModelInfoCard(target, ms.value);
    }
  };
});

${modelPickerScript("ALL_MODELS")}

// Limites gratuites Gemini par jour (carte Quotas Gemini du jour)
document.querySelectorAll('.quota-save').forEach(function (btn) {
  btn.onclick = async function () {
    var model = btn.dataset.quotaModel;
    var input = Array.prototype.find.call(document.querySelectorAll('.quota-input'), function (x) { return x.dataset.quotaModel === model; });
    var msg = document.getElementById('quota_msg');
    btn.disabled = true;
    var r = await post('/api/admin/model-quotas', { model: model, rpd: input ? input.value : '' });
    if (r.ok) { location.reload(); return; }
    var j = await r.json().catch(function () { return {}; });
    if (msg) msg.textContent = j.error || 'Enregistrement impossible.';
    btn.disabled = false;
  };
});
// Boutons Presets en 1 clic
document.querySelectorAll('.btn-preset-model').forEach(function (btn) {
  btn.onclick = function () {
    var target = btn.dataset.target;
    var prov = btn.dataset.prov;
    var mod = btn.dataset.mod;
    var thk = btn.dataset.thk || '0';

    var provSel = $('prov_' + target);
    if (provSel) {
      provSel.value = prov;
      provSel.onchange();
    }
    var modSel = $('sel_mod_' + target);
    if (modSel) {
      modSel.value = mod;
      modSel.onchange();
    }
    var thkInput = $('thk_' + target);
    if (thkInput) {
      thkInput.value = thk;
      if (thkInput.oninput) thkInput.oninput();
    }
    updateModelInfoCard(target, mod);
  };
});

// Sliders interactifs de budget réflexion
['demo', 'audit', 'card'].forEach(function (target) {
  var slider = $('thk_' + target);
  var badge = $('thk_' + target + '_val');
  if (!slider || !badge) return;
  slider.oninput = function () {
    var v = Number(this.value);
    if (v === 0) {
      badge.textContent = "0 (Désactivé - Rapide)";
      badge.className = "text-xs font-mono font-bold px-2 py-0.5 rounded text-zinc-600 bg-zinc-100 border border-zinc-200";
    } else if (v <= 2048) {
      badge.textContent = v + " tokens (Équilibré)";
      badge.className = "text-xs font-mono font-bold px-2 py-0.5 rounded text-indigo-600 bg-indigo-50 border border-indigo-200";
    } else if (v <= 4096) {
      badge.textContent = v + " tokens (Approfondi)";
      badge.className = "text-xs font-mono font-bold px-2 py-0.5 rounded text-purple-600 bg-purple-50 border border-purple-200";
    } else {
      badge.textContent = v + " tokens (Raisonnement Max)";
      badge.className = "text-xs font-mono font-bold px-2 py-0.5 rounded text-amber-700 bg-amber-50 border border-amber-200";
    }
  };
});

// Onglets filtre du catalogue de modèles (Phares vs Tous)
if ($('tab_models_flagship') && $('tab_models_all')) {
  $('tab_models_flagship').onclick = function () {
    $('tab_models_flagship').className = 'px-3 py-1 rounded-md font-semibold bg-white text-zinc-900 shadow-sm transition-all';
    $('tab_models_all').className = 'px-3 py-1 rounded-md font-medium text-zinc-600 hover:text-zinc-900 transition-all';
    document.querySelectorAll('.model-row.is-secondary').forEach(function (r) { r.classList.add('hidden'); });
  };
  $('tab_models_all').onclick = function () {
    $('tab_models_all').className = 'px-3 py-1 rounded-md font-semibold bg-white text-zinc-900 shadow-sm transition-all';
    $('tab_models_flagship').className = 'px-3 py-1 rounded-md font-medium text-zinc-600 hover:text-zinc-900 transition-all';
    document.querySelectorAll('.model-row.is-secondary').forEach(function (r) { r.classList.remove('hidden'); });
  };
}

// Bouton Actualiser les Modèles depuis l'API
if ($('btn_refresh_models')) {
  $('btn_refresh_models').onclick = async function () {
    var btn = $('btn_refresh_models');
    btn.disabled = true;
    btn.textContent = "Interrogation de l'API en cours…";
    btn.className = 'text-xs bg-zinc-200 text-zinc-500 font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-not-allowed';
    try {
      var r = await post('/api/admin/models/refresh');
      var j = await r.json();
      if (r.ok) {
        alert(j.count + ' modèles synchronisés et stockés en base !');
        location.reload();
      } else {
        alert('Erreur lors de la synchronisation des modèles.');
        btn.disabled = false;
        btn.textContent = "Actualiser depuis l'API";
        btn.className = 'text-xs bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-semibold px-3 py-1.5 rounded-lg transition-all inline-flex items-center gap-1.5 shadow-sm';
      }
    } catch (e) {
      alert('Erreur réseau.');
      btn.disabled = false;
      btn.textContent = "Actualiser depuis l'API";
    }
  };
}

// Enregistrement des modèles IA
function getModelVal(target) {
  var sel = $('sel_mod_' + target);
  var input = $('mod_' + target);
  if (sel && sel.value && sel.value !== '__custom__') {
    return sel.value.trim();
  }
  return (input ? input.value : '').trim();
}

async function handleSaveModels(btn) {
  var bTop = $('savemodels');
  var bBottom = $('savemodels_bottom');

  if (bTop) { bTop.disabled = true; bTop.textContent = 'Enregistrement…'; }
  if (bBottom) { bBottom.disabled = true; bBottom.textContent = 'Enregistrement…'; }

  var msg = $('modelsmsg');
  if (msg) {
    msg.textContent = 'Enregistrement des modèles en cours…';
    msg.className = 'text-xs text-indigo-700 font-semibold p-2.5 bg-indigo-50 border border-indigo-200 rounded-lg flex items-center gap-2 mb-3';
  }

  var payload = {
    settings: [
      { action_type: 'demo', provider: $('prov_demo').value, model: getModelVal('demo'), thinking_budget: Number($('thk_demo')?.value) || 0, fallback_models: $('fb_demo') ? $('fb_demo').value : '' },
      { action_type: 'audit', provider: $('prov_audit').value, model: getModelVal('audit'), thinking_budget: Number($('thk_audit')?.value) || 0, fallback_models: $('fb_audit') ? $('fb_audit').value : '' },
      { action_type: 'battlecard', provider: $('prov_card').value, model: getModelVal('card'), thinking_budget: Number($('thk_card')?.value) || 0, fallback_models: $('fb_card') ? $('fb_card').value : '' }
    ]
  };

  try {
    var r = await post('/api/admin/models', payload);
    var j = await r.json();
    if (r.ok && j.ok) {
      var successText = '✔ Modèles enregistrés avec succès !';
      if (bTop) {
        bTop.textContent = successText;
        bTop.className = 'text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-1.5 font-semibold shadow-sm transition-all inline-flex items-center gap-1.5';
      }
      if (bBottom) {
        bBottom.textContent = successText;
        bBottom.className = 'text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-5 py-2 font-semibold shadow-sm transition-all inline-flex items-center gap-1.5';
      }
      if (msg) {
        msg.textContent = '✔ Configuration enregistrée ! Vos choix (modèles & réflexion) sont immédiatement actifs pour les prochains scans.';
        msg.className = 'text-xs text-emerald-700 font-semibold p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 mb-3';
      }
      setTimeout(function () {
        var defaultTopText = 'Enregistrer les Modèles';
        if (bTop) {
          bTop.disabled = false;
          bTop.textContent = defaultTopText;
          bTop.className = 'text-xs bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg px-4 py-1.5 font-semibold shadow-sm transition-all inline-flex items-center gap-1.5';
        }
        if (bBottom) {
          bBottom.disabled = false;
          bBottom.textContent = defaultTopText;
          bBottom.className = 'text-xs bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg px-5 py-2 font-semibold shadow-sm transition-all inline-flex items-center gap-1.5';
        }
      }, 3000);
    } else {
      throw new Error(j.error || 'Erreur serveur');
    }
  } catch (err) {
    if (bTop) { bTop.disabled = false; bTop.textContent = 'Enregistrer les Modèles'; }
    if (bBottom) { bBottom.disabled = false; bBottom.textContent = 'Enregistrer les Modèles'; }
    if (msg) {
      msg.textContent = "Erreur lors de l'enregistrement des modèles : " + err.message;
      msg.className = 'text-xs text-rose-700 font-semibold p-2.5 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2 mb-3';
    }
  }
}

if ($('savemodels')) $('savemodels').onclick = function () { handleSaveModels($('savemodels')); };
if ($('savemodels_bottom')) $('savemodels_bottom').onclick = function () { handleSaveModels($('savemodels_bottom')); };

// Round-robin & attribution
if ($('rr')) {
  $('rr').onclick = async function () { var j = await (await post('/api/admin/assign', { mode: 'round_robin' })).json(); alert(j.assigned + ' lead(s) assigné(s)'); location.reload(); };
}
document.querySelectorAll('[data-assign]').forEach(function (s) {
  s.onchange = function () { post('/api/admin/assign', { mode: 'manual', leadId: s.dataset.assign, userId: s.value || null }); };
});

// Équipe & Whitelist
document.querySelectorAll('[data-toggle]').forEach(function (b) {
  b.onclick = async function () { await post('/api/admin/users/' + b.dataset.toggle + '/toggle'); location.reload(); };
});

document.querySelectorAll('[data-save-email]').forEach(function (b) {
  b.onclick = async function () {
    var uid = b.dataset.saveEmail;
    var inp = document.querySelector('[data-email-input="' + uid + '"]');
    if (!inp || !inp.value.trim()) return;
    b.disabled = true;
    b.textContent = '...';
    var r = await post('/api/admin/users/' + uid + '/email', { email: inp.value.trim() });
    if (r.ok) {
      b.textContent = '✔';
      setTimeout(function () { location.reload(); }, 600);
    } else {
      alert("Email invalide ou déjà utilisé");
      b.disabled = false;
      b.textContent = 'Sauver';
    }
  };
});

function buildInviteMailto(email, name, inviteCode) {
  var inviteUrl = location.origin + '/invite/' + inviteCode;
  var subject = encodeURIComponent('Invitation à rejoindre LeadEngine PRO');
  var body = encodeURIComponent(
    'Bonjour ' + name + ',\\n\\n' +
    'Ton adresse (' + email + ') a été ajoutée à la liste blanche de notre espace LeadEngine PRO.\\n\\n' +
    'Clique sur ce lien personnel pour activer ton compte (via Google ou en choisissant ton mot de passe) :\\n' +
    inviteUrl + '\\n\\n' +
    'À tout de suite !'
  );
  return 'mailto:' + encodeURIComponent(email || '') + '?subject=' + subject + '&body=' + body;
}

document.querySelectorAll('.btn-send-invite').forEach(function (b) {
  b.onclick = function () {
    var email = b.dataset.inviteMail || '';
    var name = b.dataset.inviteName || '';
    var code = b.dataset.inviteCode || '';
    location.href = buildInviteMailto(email, name, code);
  };
});

document.querySelectorAll('.btn-copy-invite').forEach(function (b) {
  b.onclick = function () {
    var code = b.dataset.copyInvite || '';
    var url = location.origin + '/invite/' + code;
    navigator.clipboard.writeText(url);
    var prev = b.textContent;
    b.textContent = '✔ Copié !';
    setTimeout(function () { b.textContent = prev; }, 1500);
  };
});

// Toggle des canaux traités par un closer (au moins un)
document.querySelectorAll('.btn-toggle-ch').forEach(function (b) {
  b.onclick = async function () {
    var userId = b.dataset.userCh;
    var next = [];
    document.querySelectorAll('.btn-toggle-ch[data-user-ch="' + userId + '"]').forEach(function (btn) {
      var on = btn === b ? btn.dataset.active !== '1' : btn.dataset.active === '1';
      if (on) next.push(btn.dataset.chId);
    });
    if (next.length === 0) { alert('Un closer doit traiter au moins un canal.'); return; }
    b.disabled = true;
    try {
      var res = await post('/api/admin/users/' + userId + '/channels', { channels: next });
      if (res.ok) {
        var nowActive = b.dataset.active !== '1';
        b.dataset.active = nowActive ? '1' : '0';
        b.className = 'btn-toggle-ch text-[11px] px-2 py-0.5 rounded border transition-colors font-medium ' +
          (nowActive ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100' : 'bg-zinc-100 border-zinc-200 text-zinc-400 hover:text-zinc-600 line-through');
      } else {
        alert('Erreur lors de la mise à jour des canaux');
      }
    } catch (e) {
      alert('Erreur réseau');
    }
    b.disabled = false;
  };
});

// Toggle des opportunités d'un closer (actif même si le closer est encore en attente de validation)
document.querySelectorAll('.btn-toggle-opp').forEach(function (b) {
  b.onclick = async function () {
    var userId = b.dataset.userOpp;
    var allButtons = document.querySelectorAll('.btn-toggle-opp[data-user-opp="' + userId + '"]');
    var nextOpps = [];
    allButtons.forEach(function (btn) {
      var isCurActive = btn.dataset.active === '1';
      var willBeActive = btn === b ? !isCurActive : isCurActive;
      if (willBeActive) {
        nextOpps.push(btn.dataset.oppId);
      }
    });
    if (nextOpps.length === 0) {
      alert("Un closer doit conserver au moins 1 besoin / opportunité actif.");
      return;
    }
    b.disabled = true;
    try {
      var res = await post('/api/admin/users/' + userId + '/opportunities', { opportunities: nextOpps });
      if (res.ok) {
        var nowActive = b.dataset.active !== '1';
        b.dataset.active = nowActive ? '1' : '0';
        b.className = 'btn-toggle-opp text-[11px] px-2 py-0.5 rounded border transition-colors font-medium ' +
          (nowActive
            ? 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'
            : 'bg-zinc-100 border-zinc-200 text-zinc-400 hover:text-zinc-600 line-through');
        b.disabled = false;
      } else {
        alert("Erreur lors de la mise à jour des opportunités");
        b.disabled = false;
      }
    } catch (e) {
      alert("Erreur réseau");
      b.disabled = false;
    }
  };
});

if ($('adduser')) {
  $('adduser').onclick = async function () {
    var opps = [];
    document.querySelectorAll('input[name="new_closer_opp"]:checked').forEach(function (cb) {
      opps.push(cb.value);
    });
    var nameVal = $('newname').value.trim();
    var emailVal = ($('newemail') ? $('newemail').value.trim() : '');
    var j = await (await post('/api/admin/users', {
      name: nameVal,
      email: emailVal,
      quota: Number($('newquota').value) || 100,
      opportunities: opps
    })).json();
    if (j.invite_code) {
      var invUrl = location.origin + '/invite/' + j.invite_code;
      var mailHref = buildInviteMailto(j.email, nameVal, j.invite_code);
      $('newtoken').innerHTML =
        '<div class="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2 mt-2">' +
          '<div class="font-bold text-emerald-900">✔ ' + nameVal + ' (' + j.email + ') a été ajouté(e) à la Whitelist !</div>' +
          '<div class="text-[11px] font-mono text-emerald-800 break-all">Lien d\\'activation : ' + invUrl + '</div>' +
          '<div class="flex flex-wrap gap-2 pt-1">' +
            '<a href="' + mailHref + '" class="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1">✉️ Ouvrir le mail d\\'invitation pré-rempli</a>' +
            '<button type="button" onclick="navigator.clipboard.writeText(\\'' + invUrl + '\\');this.textContent=\\'✔ Lien copié !\\'" class="bg-white border border-emerald-300 text-emerald-800 px-3 py-1.5 rounded-lg text-xs font-semibold">🔗 Copier le lien</button>' +
          '</div>' +
        '</div>';
    } else {
      $('newtoken').textContent = 'Erreur : ' + (j.error || "Impossible de créer l'accès");
    }
  };
}

// Coupe-circuit 0€ (Stop API)
if ($('btn-circuit-breaker')) {
  $('btn-circuit-breaker').onclick = async function () {
    if (!confirm("Activer le Coupe-Circuit 0€ ?\\n\\nToutes les actions de génération seront immédiatement basculées sur le mode local 0€ (aucun appel externe ni frais).")) return;
    try {
      var r = await post('/api/admin/models/circuit-breaker');
      if (r.ok) {
        alert("✔ Coupe-circuit activé : tous les modèles ont été coupés au profit du mode CLI 0€.");
        location.reload();
      } else {
        alert("Erreur lors de l'activation du coupe-circuit.");
      }
    } catch (e) {
      alert("Erreur réseau.");
    }
  };
}
</script>`;

  const leafletAssets =
    tab === "scanner"
      ? `<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css" />
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>`
      : "";

  return layout("Dashboard Admin", body, navbar(user.name, user.role, "admin"), leafletAssets);
}
