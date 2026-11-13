import type { SiteAudit } from "../types";
import { escapeHtml } from "../utils/helpers";
import { scoreActions, type ScoreResult } from "./reportScoring";

export interface ReportPageInput {
  title: string;
  leadId: string;
  remoteAppUrl: string;
  /** Bandeau haut de page (HTML déjà échappé), placé avant le contenu */
  header: string;
  /** Sections (HTML déjà échappé), empilées dans l'ordre */
  sections: string[];
}

const SCORE_TOGGLE_SCRIPT = `document.addEventListener('click',function(e){var t=e.target.closest&&e.target.closest('[data-score-toggle]');document.querySelectorAll('[data-score-toggle]').forEach(function(el){if(el!==t){el.setAttribute('data-open','false');}});if(t){t.setAttribute('data-open',t.getAttribute('data-open')==='true'?'false':'true');}});`;

/** Document complet : Tailwind v3 par CDN, thème sombre, pixel de lecture temps réel. */
export function renderReportPage(p: ReportPageInput): string {
  return `<!DOCTYPE html>
<html lang="fr" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>${escapeHtml(p.title)}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Inter', sans-serif; }
    .font-mono { font-family: 'JetBrains Mono', monospace; }
    [data-score-toggle][data-open="true"] .score-tip { visibility: visible; opacity: 1; }
  </style>
</head>
<body class="bg-zinc-950 text-zinc-100 min-h-screen antialiased selection:bg-indigo-500 selection:text-white">
  ${p.header}

  <main class="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
    ${p.sections.join("\n")}
  </main>

  <img src="${escapeHtml(p.remoteAppUrl)}/api/tracker/open?leadId=${escapeHtml(p.leadId)}" width="1" height="1" alt="" style="position:absolute;left:-9999px" />
  <script>${SCORE_TOGGLE_SCRIPT}</script>
</body>
</html>`;
}

/** Carte standard : titre, sous-titre optionnel, contenu (HTML échappé par l'appelant). */
export function renderCard(title: string, body: string, subtitle?: string): string {
  return `<section class="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-5 sm:p-6 space-y-4">
      <div>
        <h2 class="font-semibold text-base text-white">${escapeHtml(title)}</h2>
        ${subtitle ? `<p class="text-xs text-zinc-400 mt-0.5">${escapeHtml(subtitle)}</p>` : ""}
      </div>
      ${body}
    </section>`;
}

/** Tableau : en-têtes et cellules sont du texte brut, échappé ici. */
export function renderTable(headers: string[], rows: string[][], rightFrom = 1): string {
  const th = headers
    .map((h, i) => `<th class="py-2.5 px-3 ${i >= rightFrom ? "text-right" : ""}">${escapeHtml(h)}</th>`)
    .join("");
  const tr = rows
    .map(
      (r) =>
        `<tr class="border-b border-zinc-800/80">${r
          .map((c, i) => `<td class="py-3 px-3 ${i === 0 ? "font-medium text-zinc-100" : "text-zinc-300"} ${i >= rightFrom ? "text-right whitespace-nowrap" : ""}">${escapeHtml(c)}</td>`)
          .join("")}</tr>`,
    )
    .join("");
  return `<div class="overflow-x-auto"><table class="w-full text-left border-collapse text-sm">
      <thead><tr class="border-b border-zinc-800 text-[11px] uppercase tracking-wide text-zinc-400 bg-zinc-950/40">${th}</tr></thead>
      <tbody>${tr}</tbody></table></div>`;
}

/** Ligne « libellé : constat » avec pastille. */
export function renderCheck(label: string, ok: boolean | null, detail: string): string {
  const dot = ok === null ? "bg-zinc-500" : ok ? "bg-emerald-400" : "bg-rose-400";
  return `<li class="flex items-start gap-3 text-sm"><span class="mt-1.5 w-2 h-2 rounded-full shrink-0 ${dot}"></span><span><span class="font-medium text-zinc-100">${escapeHtml(label)}</span> <span class="text-zinc-400">— ${escapeHtml(detail)}</span></span></li>`;
}

/** Date en français ; chaîne vide si la date est absente ou invalide (jamais « aujourd'hui » par défaut). */
export function dateFr(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** Ligne « Constat du … », vide si la date n'est pas connue. */
export function renderCheckedAt(iso?: string | null): string {
  const d = dateFr(iso);
  return d ? `<p class="text-xs text-zinc-400">Constat du ${escapeHtml(d)}</p>` : "";
}

/** Score /100 ; détail en infobulle (survol, focus clavier, toucher via data-score-toggle). */
export function renderScoreBadge(r: ScoreResult): string {
  const color = r.score >= 70 ? "text-emerald-400 border-emerald-500/40" : r.score >= 40 ? "text-amber-300 border-amber-500/40" : "text-rose-400 border-rose-500/40";
  const rows = r.criteria
    .map((c) => `<li class="flex justify-between gap-4"><span>${escapeHtml(c.label)}</span><span class="font-mono whitespace-nowrap">${c.earned === null ? "non mesuré" : `${c.earned}/${c.max}`}</span></li>`)
    .join("");
  const removed = r.removed
    .map((c) => `<li class="flex justify-between gap-4 text-zinc-400"><span>${escapeHtml(c.label)}</span><span class="whitespace-nowrap">non mesuré</span></li>`)
    .join("");
  return `<div class="group relative inline-block" data-score-toggle data-open="false" tabindex="0" role="button" aria-label="Voir le détail du score">
      <div class="cursor-help rounded-2xl border bg-zinc-950/70 px-5 py-3 text-center ${color}">
        <div class="text-3xl font-bold leading-none">${r.score}<span class="text-base text-zinc-400">/100</span></div>
        <div class="text-[11px] text-zinc-400 mt-1 underline decoration-dotted">détail du score</div>
      </div>
      <div class="score-tip invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus:visible group-focus:opacity-100 transition-opacity absolute right-0 top-full mt-2 z-40 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-zinc-700 bg-zinc-900 p-4 text-left text-xs text-zinc-200 shadow-xl">
        <div class="font-semibold text-white mb-2">Comment le score est calculé</div>
        <ul class="space-y-1.5">${rows}${removed}</ul>
        ${r.removed.length ? `<p class="mt-2 text-zinc-400">Les critères non mesurés sont retirés du total : le score est ramené sur 100.</p>` : ""}
      </div>
    </div>`;
}

export function renderActions(r: ScoreResult): string {
  const actions = scoreActions(r, 3);
  const body = actions.length
    ? `<ol class="space-y-2 text-sm text-zinc-200 list-decimal pl-5">${actions.map((a) => `<li>${escapeHtml(a)}</li>`).join("")}</ol>`
    : `<p class="text-sm text-zinc-300">Aucun point à corriger parmi les éléments mesurés.</p>`;
  return renderCard("Trois actions prioritaires", body);
}

export function renderSiteDemoLink(url: string | null): string {
  if (!url || !(/^https?:\/\//i.test(url) || url.startsWith("/demos/"))) return "";
  return `<a href="${escapeHtml(url)}" class="inline-block rounded-lg bg-indigo-500 hover:bg-indigo-400 px-4 py-2.5 text-sm font-semibold text-white">Voir à quoi pourrait ressembler votre site</a>`;
}

export function buildReportAudit(r: ScoreResult, summary: string): SiteAudit {
  return { summary, weaknesses: scoreActions(r), score: r.score };
}
