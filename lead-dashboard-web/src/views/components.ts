import { CHANNEL_LABELS, isChannelId, opportunityIdOf } from "../../../shared/opportunities";
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
    label: "En cours / Appelé",
    pillLabel: "📞 En cours / Appelé",
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
export const OPP_META: Record<string, { label: string; cls: string }> = Object.fromEntries(
  OPPORTUNITY_TYPES.map((o) => [o.id, { label: o.badge, cls: BADGE_TONE_CLASSES[o.tone] }]),
);

/** Badge d'une opportunité ; un identifiant inconnu est affiché tel quel en gris. */
export function opportunityBadgeMeta(opportunityType?: string | null): { label: string; cls: string } {
  const key = opportunityIdOf(opportunityType);
  return OPP_META[key] ?? { label: key, cls: BADGE_TONE_CLASSES.zinc };
}

export function renderOpportunityBadge(opportunityType?: string | null): string {
  const opp = opportunityBadgeMeta(opportunityType);
  return `<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold border ${opp.cls}">${esc(opp.label)}</span>`;
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

export function renderAuditScoreBadge(score: number | undefined, websiteUrl: string | null | undefined): string {
  if (score !== undefined) {
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
