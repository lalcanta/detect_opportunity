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
  DEMO_FOCUS_CATALOG,
  PITCH_GENERATOR_CATALOG,
  PITCH_KIND_BY_GENERATOR,
  PROOF_CATALOG,
  SCAN_MODULE_CATALOG,
  SCAN_MODULE_IDS,
  STATUS_CATALOG,
  WEBSITE_REQUIREMENT_CATALOG,
} from "../../../shared/opportunities";
import { icon, type IconName } from "./layout";

/** Change à chaque modification de public/static/besoins.js, pour contourner le cache du CDN. */
export const NEEDS_ASSET_VERSION = "20261112e";

/** Icônes proposées pour un besoin, et celles du graphe. */
const NEED_ICONS: IconName[] = ["globe", "shield", "star", "map-pin", "target", "sparkles", "search", "chart", "zap", "users", "file-text", "message", "phone", "mail", "layers", "cpu"];
const GRAPH_ICONS: IconName[] = ["search", "sliders", "eye", "check-circle", "arrow-right", "sparkles", "file-text", "phone", "mail", "message", "inbox", "user", "layers"];

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
