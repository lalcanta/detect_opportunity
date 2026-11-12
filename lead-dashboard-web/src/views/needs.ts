/**
 * Onglet admin « Besoins » : fiche de chaque besoin, graphe du workflow de collecte et édition.
 * Le rendu et l'édition se font côté navigateur (public/static/besoins.js) à partir de l'API
 * /api/admin/opportunities ; cette vue fournit le conteneur et le catalogue des briques.
 */
import {
  BADGE_TONE_CATALOG,
  BUSINESS_MODEL_CATALOG,
  CHANNEL_CATALOG,
  CHANNEL_IDS,
  DATA_KEYS,
  DEMO_FOCUS_CATALOG,
  DEMO_HIGHLIGHT_CATALOG,
  INTEREST_CTA_PRESETS,
  LISTING_STEPS,
  MESSAGE_TONE_CATALOG,
  PITCH_GENERATOR_CATALOG,
  PITCH_KIND_BY_GENERATOR,
  PROOF_CATALOG,
  SCAN_MODULE_CATALOG,
  SCAN_MODULE_IDS,
  STATUS_CATALOG,
  WEBSITE_REQUIREMENT_CATALOG,
  WORKFLOW_NODES,
  WORKFLOW_STAGES,
} from "../../../shared/opportunities";
import { SCANNABLE_OPPORTUNITY_TYPES } from "../types";
import { opportunityBadgeMeta } from "./components";
import { esc, icon, type IconName } from "./layout";

/** Change à chaque modification de public/static/besoins.js, pour contourner le cache du CDN. */
export const NEEDS_ASSET_VERSION = "20261112w2";

/** Icônes proposées pour un besoin, et celles du graphe. */
const NEED_ICONS: IconName[] = ["globe", "shield", "star", "map-pin", "target", "sparkles", "search", "chart", "zap", "users", "file-text", "message", "phone", "mail", "layers", "cpu"];
const GRAPH_ICONS: IconName[] = [
  ...new Set([...WORKFLOW_NODES.map((n) => n.icon as IconName), "arrow-right", "check", "x", "alert-circle", "zap"] as IconName[]),
];

export function needsTab(): string {
  const icons: Record<string, string> = {};
  for (const name of new Set([...NEED_ICONS, ...GRAPH_ICONS])) icons[name] = icon(name, "w-full h-full");
  const catalog = {
    channels: CHANNEL_IDS.map((id) => ({ id, ...CHANNEL_CATALOG[id] })),
    modules: SCAN_MODULE_IDS.map((id) => ({ id, ...SCAN_MODULE_CATALOG[id] })),
    website: WEBSITE_REQUIREMENT_CATALOG,
    pitch: Object.entries(PITCH_GENERATOR_CATALOG).map(([id, e]) => ({ id, kind: PITCH_KIND_BY_GENERATOR[id as keyof typeof PITCH_KIND_BY_GENERATOR], ...e })),
    proof: PROOF_CATALOG,
    focus: DEMO_FOCUS_CATALOG,
    status: STATUS_CATALOG,
    businessModel: BUSINESS_MODEL_CATALOG,
    tones: BADGE_TONE_CATALOG,
    nodes: WORKFLOW_NODES,
    stages: WORKFLOW_STAGES,
    keys: DATA_KEYS,
    highlights: Object.entries(DEMO_HIGHLIGHT_CATALOG).map(([id, e]) => ({ id, label: e.label, description: e.description })),
    messageTones: Object.entries(MESSAGE_TONE_CATALOG).map(([id, e]) => ({ id, label: e.label, description: e.description })),
    ctaPresets: INTEREST_CTA_PRESETS,
    listingSteps: LISTING_STEPS,
    needIcons: NEED_ICONS,
    icons,
  };
  const json = JSON.stringify(catalog).replace(/</g, "\\u003c");
  return `<section id="needs-app" class="min-h-[60vh]" aria-live="polite">
  <div class="bg-white rounded-2xl border border-zinc-200/80 shadow-sm p-8 text-sm text-zinc-500">Chargement des besoins…</div>
</section>
<script type="application/json" id="needs-catalog">${json}</script>
<script src="/static/besoins.js?v=${NEEDS_ASSET_VERSION}" defer></script>`;
}

/**
 * Choix du besoin au lancement d'un scan : une carte par besoin actif, avec ce qu'il exige. La valeur choisie est
 * recopiée dans le champ caché `hiddenId` (lu par les scripts du Scanner). Le besoin fixe aussi le filtre de site.
 */
export function opportunityPicker(hiddenId: string, selectedId: string): string {
  const types = SCANNABLE_OPPORTUNITY_TYPES;
  const selected = types.some((t) => t.id === selectedId) ? selectedId : (types[0]?.id ?? "");
  const siteLabel: Record<string, string> = { required: "Site exigé", forbidden: "Sans site", optional: "Site facultatif" };
  const cards = types
    .map((ot) => {
      const meta = opportunityBadgeMeta(ot.id);
      const checked = ot.id === selected;
      return `<label class="relative flex gap-3 p-3 rounded-xl border cursor-pointer transition-all has-[:checked]:border-zinc-900 has-[:checked]:ring-1 has-[:checked]:ring-zinc-900 has-[:checked]:bg-white border-zinc-200 bg-zinc-50/60 hover:bg-white">
        <input type="radio" name="${hiddenId}_pick" value="${esc(ot.id)}" ${checked ? "checked" : ""} class="sr-only" data-opp-pick="${hiddenId}">
        <span class="w-8 h-8 p-1.5 rounded-lg border shrink-0 ${meta.cls}">${icon(ot.icon as IconName, "w-full h-full")}</span>
        <span class="min-w-0">
          <span class="block text-xs font-bold text-zinc-900">${esc(ot.label)}</span>
          <span class="block text-[11px] text-zinc-600 mt-0.5">${esc(siteLabel[ot.websiteRequirement] ?? "")} · exige ${esc(ot.contactRequirement)}</span>
          <span class="block text-[11px] text-zinc-500">${ot.proofType === "demo_web" ? "Démo de site" : "Rapport d'audit"} · ${ot.channel === "vocal_closer" ? "appel" : "message écrit"}</span>
        </span>
      </label>`;
    })
    .join("");
  return `<input type="hidden" id="${hiddenId}" value="${esc(selected)}">
  <div class="grid sm:grid-cols-2 xl:grid-cols-3 gap-2" role="radiogroup">${cards}</div>
  <p class="text-[10px] text-zinc-500 mt-1">Le besoin fixe les prérequis (site, contacts), l'inspection, la démo et le message. <a href="/admin?tab=needs" class="font-semibold text-indigo-700 hover:underline">Voir ou modifier les besoins</a></p>`;
}
