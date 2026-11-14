import { CHANNEL_LABELS, findOpportunity, isChannelId, isReportProof, onOpportunitiesChange, opportunityIdOf } from "../../../shared/opportunities";
import { OPPORTUNITY_TYPES, type BadgeTone } from "../types";
import type { LeadRow } from "../types";
import { esc, icon, type IconName } from "./layout";

export interface ColumnDef {
  key: string;
  label: string;
  pillLabel: string;
  icon: IconName;
  headerBg: string;
  badgeBg: string;
  pillCls: string;
  borderAccent: string;
}

export const LEAD_COLUMNS: ColumnDef[] = [
  {
    key: "hot_lead",
    label: "Leads Chauds",
    pillLabel: "🔥 Lead Chaud",
    icon: "flame",
    headerBg: "bg-rose-50/70 text-rose-950 border-rose-200/80",
    badgeBg: "bg-rose-100 text-rose-800",
    pillCls: "bg-rose-50 text-rose-700 border-rose-200",
    borderAccent: "border-t-2 border-rose-500",
  },
  {
    key: "demo_ready",
    label: "À contacter",
    pillLabel: "📥 À contacter",
    icon: "inbox",
    headerBg: "bg-indigo-50/70 text-indigo-950 border-indigo-200/80",
    badgeBg: "bg-indigo-100 text-indigo-800",
    pillCls: "bg-indigo-50 text-indigo-700 border-indigo-200",
    borderAccent: "border-t-2 border-indigo-500",
  },
  {
    key: "called",
    label: "Contactés",
    pillLabel: "💬 Contacté",
    icon: "phone",
    headerBg: "bg-amber-50/70 text-amber-950 border-amber-200/80",
    badgeBg: "bg-amber-100 text-amber-800",
    pillCls: "bg-amber-50 text-amber-800 border-amber-200",
    borderAccent: "border-t-2 border-amber-500",
  },
  {
    key: "callback_scheduled",
    label: "Relance ultérieure",
    pillLabel: "📅 Relance prévue",
    icon: "calendar",
    headerBg: "bg-purple-50/70 text-purple-950 border-purple-200/80",
    badgeBg: "bg-purple-100 text-purple-800",
    pillCls: "bg-purple-50 text-purple-800 border-purple-200",
    borderAccent: "border-t-2 border-purple-500",
  },
  {
    key: "won",
    label: "Gagnés",
    pillLabel: "🏆 Gagné",
    icon: "check-circle",
    headerBg: "bg-emerald-50/70 text-emerald-950 border-emerald-200/80",
    badgeBg: "bg-emerald-100 text-emerald-800",
    pillCls: "bg-emerald-50 text-emerald-700 border-emerald-200",
    borderAccent: "border-t-2 border-emerald-500",
  },
  {
    key: "lost",
    label: "Perdus",
    pillLabel: "✕ Perdu",
    icon: "x-circle",
    headerBg: "bg-zinc-100/70 text-zinc-800 border-zinc-200",
    badgeBg: "bg-zinc-200 text-zinc-700",
    pillCls: "bg-zinc-100 text-zinc-600 border-zinc-200",
    borderAccent: "border-t-2 border-zinc-400",
  },
];

const BADGE_TONE_CLASSES: Record<BadgeTone, string> = {
  blue: "bg-blue-50 text-blue-700 border-blue-200",
  cyan: "bg-cyan-50 text-cyan-800 border-cyan-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  purple: "bg-purple-50 text-purple-700 border-purple-200",
  zinc: "bg-zinc-100 text-zinc-700 border-zinc-200",
};

/** Libellé et classes du badge de chaque opportunité, dérivés de shared/opportunities. */
export const OPP_META: Record<string, { label: string; cls: string }> = {};

function refreshOppMeta(): void {
  for (const k of Object.keys(OPP_META)) delete OPP_META[k];
  for (const o of OPPORTUNITY_TYPES) OPP_META[o.id] = { label: o.badge, cls: BADGE_TONE_CLASSES[o.tone] };
}
refreshOppMeta();
onOpportunitiesChange(refreshOppMeta);

/** Badge d'une opportunité ; un identifiant inconnu est affiché tel quel en gris. */
export function opportunityBadgeMeta(opportunityType?: string | null): { label: string; cls: string } {
  const key = opportunityIdOf(opportunityType);
  return OPP_META[key] ?? { label: key, cls: BADGE_TONE_CLASSES.zinc };
}

export function renderOpportunityBadge(opportunityType?: string | null): string {
  const opp = opportunityBadgeMeta(opportunityType);
  return `<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold border ${opp.cls}">${esc(opp.label)}</span>`;
}

/** Date du scan d'un lead (created_at), au fuseau de Paris. */
export function formatScanDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Badge du canal principal d'un lead ; rien pour un lead antérieur à la phase 1. */
export function renderChannelBadge(primaryChannel?: string | null): string {
  if (!isChannelId(primaryChannel)) return "";
  return `<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold border bg-white text-zinc-600 border-zinc-200" title="Canal principal">${esc(CHANNEL_LABELS[primaryChannel])}</span>`;
}

export function renderStatusPill(status: string): string {
  const col = LEAD_COLUMNS.find((c) => c.key === status);
  if (!col) {
    return `<span class="px-2.5 py-0.5 rounded-md text-xs font-semibold border bg-zinc-100 text-zinc-700 border-zinc-200">${esc(status)}</span>`;
  }
  return `<span class="px-2.5 py-0.5 rounded-md text-xs font-semibold border ${col.pillCls}">${esc(col.pillLabel)}</span>`;
}

export function formatStatusLabel(status: string): string {
  const col = LEAD_COLUMNS.find((c) => c.key === status);
  return col ? col.pillLabel : status;
}

export function renderGoogleRatingBadge(
  rating: number | null | undefined,
  reviewsCount?: number | null,
  showCount = true,
): string {
  return `<span class="text-xs text-amber-700 font-medium flex items-center gap-1 shrink-0">
    ${icon("star", "w-3 h-3 fill-amber-400 text-amber-500")}
    <span>${esc(rating ?? "–")}</span>
    ${showCount ? `<span class="text-zinc-400 font-normal">(${esc(reviewsCount ?? 0)})</span>` : ""}
  </span>`;
}

/** Le score n'apparaît que s'il a été mesuré (bilan, audit réel) : absent ou nul, le badge de repli s'affiche. */
export function renderAuditScoreBadge(score: number | null | undefined, websiteUrl: string | null | undefined): string {
  if (typeof score === "number" && Number.isFinite(score)) {
    const cls =
      score < 50
        ? "bg-rose-50 text-rose-700 border border-rose-200/80"
        : "bg-emerald-50 text-emerald-700 border border-emerald-200/80";
    return `<span class="text-[10px] font-bold px-2 py-0.5 rounded-md ${cls}">Score : ${score}/100</span>`;
  }
  if (websiteUrl) {
    return `<span class="text-[10px] font-medium text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-md">Site en ligne</span>`;
  }
  return `<span class="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/70 px-2 py-0.5 rounded-md">Sans site web</span>`;
}

export interface DemoAccessState {
  isRevoked: boolean;
  isExpired: boolean;
  isInactive: boolean;
  daysLeft: number | null;
  cardBadgeText: string;
  sidepanelBadgeText: string;
  sidepanelBadgeClass: string;
  canOpenDemo: boolean;
  canRevoke: boolean;
  extendButtonText: string;
}

/**
 * Source unique de vérité (Single Source of Truth) pour l'état d'accès à la démo d'un lead.
 * Utilisé aussi bien côté serveur (rendu SSR des cartes et fiches) que dans les tests unitaires.
 */
export function getDemoAccessState(
  lead: Pick<LeadRow, "demo_revoked" | "demo_expires_at">,
  nowMs = Date.now(),
): DemoAccessState {
  const isRevoked = lead.demo_revoked === 1;
  const expMs = lead.demo_expires_at ? Date.parse(lead.demo_expires_at) : Number.NaN;
  const isExpired = !Number.isNaN(expMs) && expMs <= nowMs;
  const isInactive = isRevoked || isExpired;

  if (isRevoked) {
    return {
      isRevoked: true,
      isExpired,
      isInactive: true,
      daysLeft: null,
      cardBadgeText: "🔒 Démo invalidée",
      sidepanelBadgeText: "🔒 Démo invalidée",
      sidepanelBadgeClass: "text-[10px] bg-rose-100 text-rose-800 border border-rose-200 font-bold px-1.5 py-0.5 rounded",
      canOpenDemo: false,
      canRevoke: false,
      extendButtonText: "🔄 Réactiver (+5 jours)",
    };
  }

  if (isExpired) {
    return {
      isRevoked: false,
      isExpired: true,
      isInactive: true,
      daysLeft: 0,
      cardBadgeText: "⏳ Démo expirée",
      sidepanelBadgeText: "⏳ Expirée",
      sidepanelBadgeClass: "text-[10px] bg-amber-100 text-amber-800 border border-amber-200 font-bold px-1.5 py-0.5 rounded",
      canOpenDemo: false,
      canRevoke: false,
      extendButtonText: "🔄 Prolonger (+5 jours)",
    };
  }

  if (!Number.isNaN(expMs)) {
    const daysLeft = Math.max(1, Math.ceil((expMs - nowMs) / (24 * 60 * 60 * 1000)));
    return {
      isRevoked: false,
      isExpired: false,
      isInactive: false,
      daysLeft,
      cardBadgeText: "Démo",
      sidepanelBadgeText: `⏳ Expire dans ${daysLeft}j`,
      sidepanelBadgeClass: "text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-200 font-semibold px-1.5 py-0.5 rounded",
      canOpenDemo: true,
      canRevoke: true,
      extendButtonText: "🔄 Prolonger (+5 jours)",
    };
  }

  return {
    isRevoked: false,
    isExpired: false,
    isInactive: false,
    daysLeft: null,
    cardBadgeText: "Démo",
    sidepanelBadgeText: "✔ Active (auto +5j après vue/appel)",
    sidepanelBadgeClass: "text-[10px] bg-indigo-100 text-indigo-800 font-semibold px-1.5 py-0.5 rounded",
    canOpenDemo: true,
    canRevoke: true,
    extendButtonText: "🔄 Prolonger (+5 jours)",
  };
}

export type DemoSlotVariant = "compact" | "button";

export function renderCardDemoInner(
  leadId: string,
  state: Pick<DemoAccessState, "isInactive" | "cardBadgeText">,
  variant: DemoSlotVariant = "compact",
): string {
  if (state.isInactive) {
    if (variant === "button") {
      return `<span class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">${esc(state.cardBadgeText)}</span>`;
    }
    return `<span class="text-[11px] font-semibold text-rose-600 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">${esc(state.cardBadgeText)}</span>`;
  }

  if (variant === "button") {
    return `<a href="/demos/${esc(leadId)}" target="_blank" rel="noopener" class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-colors" title="Démo Tailwind">
      <span>Démo</span>
      ${icon("arrow-up-right", "w-3 h-3 text-indigo-500")}
    </a>`;
  }

  return `<a href="/demos/${esc(leadId)}" target="_blank" rel="noopener" class="text-indigo-600 hover:text-indigo-800 font-semibold text-xs inline-flex items-center gap-1 hover:underline transition-colors" title="Ouvrir la démo" onclick="event.stopPropagation()">
    <span>Démo</span>
    ${icon("arrow-up-right", "w-3 h-3 text-indigo-500")}
  </a>`;
}

/**
 * Composant réutilisable d'accès à la démo pour toutes les cartes (Kanban, Liste, Agenda).
 * Conserve `data-demo-variant` pour que la mise à jour DOM côté client respecte exactement le style de la carte.
 */
export function renderCardDemoSlot(
  lead: Pick<LeadRow, "id" | "demo_revoked" | "demo_expires_at">,
  variant: DemoSlotVariant = "compact",
): string {
  const state = getDemoAccessState(lead);
  return `<span data-card-demo-slot="${esc(lead.id)}" data-demo-variant="${variant}">${renderCardDemoInner(lead.id, state, variant)}</span>`;
}

/**
 * Génère le helper JavaScript côté client qui réutilise exactement les mêmes templates et règles
 * que `getDemoAccessState` et `renderCardDemoInner` côté serveur (Zéro duplication SSR / Client).
 */
export function renderClientDemoSlotHelperScript(): string {
  const arrowIcon = icon("arrow-up-right", "w-3 h-3 text-indigo-500");
  return `
function computeDemoAccessState(lead) {
  var nowMs = Date.now();
  var expMs = lead.demo_expires_at ? Date.parse(lead.demo_expires_at) : NaN;
  var isExpired = !isNaN(expMs) && expMs <= nowMs;
  var isRevoked = lead.demo_revoked === 1;
  var isInactive = isRevoked || isExpired;

  if (isRevoked) {
    return {
      isRevoked: true,
      isExpired: isExpired,
      isInactive: true,
      cardBadgeText: '🔒 Démo invalidée',
      sidepanelBadgeText: '🔒 Démo invalidée',
      sidepanelBadgeClass: 'text-[10px] bg-rose-100 text-rose-800 border border-rose-200 font-bold px-1.5 py-0.5 rounded',
      canOpenDemo: false,
      canRevoke: false,
      extendButtonText: '🔄 Réactiver (+5 jours)'
    };
  }
  if (isExpired) {
    return {
      isRevoked: false,
      isExpired: true,
      isInactive: true,
      cardBadgeText: '⏳ Démo expirée',
      sidepanelBadgeText: '⏳ Expirée',
      sidepanelBadgeClass: 'text-[10px] bg-amber-100 text-amber-800 border border-amber-200 font-bold px-1.5 py-0.5 rounded',
      canOpenDemo: false,
      canRevoke: false,
      extendButtonText: '🔄 Prolonger (+5 jours)'
    };
  }
  if (!isNaN(expMs)) {
    var daysLeft = Math.max(1, Math.ceil((expMs - nowMs) / (24 * 60 * 60 * 1000)));
    return {
      isRevoked: false,
      isExpired: false,
      isInactive: false,
      cardBadgeText: 'Démo',
      sidepanelBadgeText: '⏳ Expire dans ' + daysLeft + 'j',
      sidepanelBadgeClass: 'text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-200 font-semibold px-1.5 py-0.5 rounded',
      canOpenDemo: true,
      canRevoke: true,
      extendButtonText: '🔄 Prolonger (+5 jours)'
    };
  }
  return {
    isRevoked: false,
    isExpired: false,
    isInactive: false,
    cardBadgeText: 'Démo',
    sidepanelBadgeText: '✔ Active (auto +5j après vue/appel)',
    sidepanelBadgeClass: 'text-[10px] bg-indigo-100 text-indigo-800 font-semibold px-1.5 py-0.5 rounded',
    canOpenDemo: true,
    canRevoke: true,
    extendButtonText: '🔄 Prolonger (+5 jours)'
  };
}

function renderClientCardDemoSlotInner(leadId, state, variant) {
  if (state.isInactive) {
    if (variant === 'button') {
      return '<span class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">' + state.cardBadgeText + '</span>';
    }
    return '<span class="text-[11px] font-semibold text-rose-600 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">' + state.cardBadgeText + '</span>';
  }
  if (variant === 'button') {
    return '<a href="/demos/' + leadId + '" target="_blank" rel="noopener" class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-colors" title="Démo Tailwind"><span>Démo</span>${arrowIcon}</a>';
  }
  return '<a href="/demos/' + leadId + '" target="_blank" rel="noopener" class="text-indigo-600 hover:text-indigo-800 font-semibold text-xs inline-flex items-center gap-1 hover:underline transition-colors" title="Ouvrir la démo" onclick="event.stopPropagation()"><span>Démo</span>${arrowIcon}</a>';
}
`;
}

/** Lien de la bibliothèque publicitaire Meta pour un nom d'entreprise (fiche du closer uniquement, jamais dans le bilan). */
export function metaAdLibraryUrl(companyName: string): string {
  return `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=FR&q=${encodeURIComponent(companyName)}`;
}

interface ReportCompetitor {
  name?: unknown;
  rank?: unknown;
  rating?: unknown;
  reviewsCount?: unknown;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * Bloc « Bilan » de la fiche du closer, pour un lead dont la preuve est un bilan (visibilité ou acquisition) :
 * rang et recherche Maps telle que lancée, concurrents mieux placés, liens vers le bilan et la démo de site
 * complémentaire, et pour un bilan d'acquisition la bibliothèque publicitaire Meta. Vide pour un autre lead, ou un
 * lead sans constat Maps (ancien lead du même besoin). Rendu côté serveur ; le panneau l'insère tel quel.
 */
export function renderReportBrief(
  lead: Pick<LeadRow, "id" | "company_name" | "opportunity_type" | "audit_data" | "has_site_demo">,
  origin: string,
): string {
  const proof = findOpportunity(opportunityIdOf(lead.opportunity_type))?.proof.kind;
  if (!proof || !isReportProof(proof)) return "";
  let audit: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = lead.audit_data ? JSON.parse(lead.audit_data) : null;
    audit = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    audit = null;
  }
  if (!audit || (!str(audit.maps_query) && !Array.isArray(audit.competitors))) return "";

  const rank = num(audit.maps_rank);
  const query = str(audit.maps_query);
  const checked = formatScanDate(str(audit.maps_checked_at) || null);
  const competitors = (Array.isArray(audit.competitors) ? (audit.competitors as ReportCompetitor[]) : [])
    .filter((c) => c && typeof c === "object" && str(c.name))
    .filter((c) => rank === null || (num(c.rank) ?? Infinity) < rank)
    .sort((a, b) => (num(a.rank) ?? Infinity) - (num(b.rank) ?? Infinity))
    .slice(0, 5);

  // Sans recherche Maps (scan par liste de domaines), la position n'a pas été mesurée : rien ne dit qu'il est absent.
  const rankMeasured = !!query && audit.no_maps_listing !== true;
  const rankText = rank !== null ? (rank === 1 ? "1er sur Maps" : `${rank}e sur Maps`) : rankMeasured ? "Hors des résultats relevés" : "Position non mesurée";
  const search = query ? `pour « ${query} »` : "recherche non relevée";
  const rows = competitors
    .map((c) => {
      const r = num(c.rank);
      const rating = num(c.rating);
      const reviews = num(c.reviewsCount);
      return `<li class="flex items-center justify-between gap-2 py-1">
        <span class="min-w-0 truncate"><span class="text-zinc-400 font-mono">${r === null ? "–" : esc(r)}.</span> <span class="font-semibold text-zinc-900">${esc(str(c.name))}</span></span>
        <span class="shrink-0 text-amber-700">★ ${rating === null ? "–" : esc(String(rating).replace(".", ","))} <span class="text-zinc-400">(${reviews === null ? "?" : esc(reviews)} avis)</span></span>
      </li>`;
    })
    .join("");
  const above = competitors.length
    ? `<p class="text-[11px] font-bold text-zinc-500">${rank === null ? "Concurrents affichés" : "Devant lui"}</p><ul class="text-xs divide-y divide-zinc-100">${rows}</ul>`
    : rank === 1
      ? `<p class="text-xs text-emerald-700 font-semibold">En tête de la recherche : aucun concurrent devant.</p>`
      : `<p class="text-xs text-zinc-500">Aucun concurrent relevé.</p>`;

  const link = (href: string, label: string, extra = "") =>
    `<a href="${esc(href)}" target="_blank" rel="noopener" class="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border border-zinc-200 bg-white text-xs font-semibold text-zinc-800 hover:bg-zinc-50"${extra}>${icon("external", "w-3 h-3")} ${esc(label)}</a>`;
  const base = origin.replace(/\/+$/, "");
  const links = [
    link(`${base}/demos/${encodeURIComponent(lead.id)}`, "Voir le bilan"),
    lead.has_site_demo ? link(`${base}/demos/${encodeURIComponent(lead.id)}/site`, "Démo de site") : "",
    proof === "acquisition_report" ? link(metaAdLibraryUrl(lead.company_name), "Voir ses publicités Meta", ' data-meta-ads=""') : "",
  ].join("");

  return `<section class="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3 space-y-2" data-report-brief="${esc(proof)}">
    <div class="flex flex-wrap items-baseline justify-between gap-x-2">
      <p class="text-[11px] font-extrabold uppercase tracking-wider text-zinc-500">Bilan</p>
      ${checked ? `<p class="text-[11px] text-zinc-500">constat du ${esc(checked)}</p>` : ""}
    </div>
    <p class="text-sm text-zinc-800"><b class="text-zinc-950">${esc(rankText)}</b> <span class="text-zinc-600">${esc(search)}</span></p>
    ${above}
    <div class="flex flex-wrap gap-1.5 pt-1">${links}</div>
  </section>`;
}
