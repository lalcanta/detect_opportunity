import { DEFAULT_OPPORTUNITY_ID, opportunityIdOf } from "../../../shared/opportunities";
import { OPPORTUNITY_TYPES, parseAllowedOpportunities, type Battlecard, type LeadRow, type User } from "../types";
import { EMAIL_TEMPLATES, buildTemplateVars } from "../templates/emailTemplates";
import { esc, icon, layout, navbar, telHref, toWaNumber } from "./layout";
import {
  LEAD_COLUMNS as COLUMNS,
  OPP_META,
  renderAuditScoreBadge,
  renderCardDemoSlot,
  renderClientDemoSlotHelperScript,
  renderGoogleRatingBadge,
  renderOpportunityBadge,
  renderChannelBadge,
  formatScanDate,
} from "./components";

export { OPP_META };

interface CloserProps {
  user: User;
  leads: LeadRow[];
  scope: string;
  view: string;
  origin: string;
  opp?: string;
}

interface AuditData {
  summary?: string;
  weaknesses?: string[];
  score?: number;
  loadTimeMs?: number | null;
  isResponsive?: boolean | null;
  dominantColors?: string[];
  paid_ads_detected?: string[];
  is_https?: boolean | null;
  copyright_year?: number | null;
  obsolescence_signals?: string[];
}

function parseCard(raw: string | null): Battlecard | null {
  try {
    return raw ? (JSON.parse(raw) as Battlecard) : null;
  } catch {
    return null;
  }
}

function parseAudit(raw: string | null): AuditData | null {
  try {
    return raw ? (JSON.parse(raw) as AuditData) : null;
  } catch {
    return null;
  }
}

const TASK_LABELS: Record<string, string> = { demo: "Démo", audit: "Audit", battlecard: "Battlecard" };

/** Provenance lisible : une ligne par tâche, avec le repli éventuel (ex. « Démo : gemini-3-flash-preview — repli de @cf/… »). */
export function describeGeneration(raw?: string | null): string[] {
  if (!raw) return [];
  const seen = new Map<string, string>();
  for (const part of raw.split(";")) {
    const [task = "", model = "", requested = ""] = part.split("|");
    if (!task || !model) continue;
    const who = model.startsWith("agent:")
      ? `agent ${model.slice(6)} (mode prep, 0 €)`
      : model.startsWith("deterministe")
        ? "généré sans IA (déterministe)"
        : model;
    seen.set(task, requested ? `${who} — repli, ${requested} indisponible` : who);
  }
  return [...seen.entries()].map(([task, who]) => `${TASK_LABELS[task] ?? task} : ${who}`);
}

function parseFormMeta(raw?: string | null): { captcha: string } {
  if (!raw) return { captcha: "" };
  try {
    const m = JSON.parse(raw) as { captcha?: unknown };
    return { captcha: typeof m.captcha === "string" ? m.captcha : "" };
  } catch {
    return { captcha: "" };
  }
}

function parseAuditRaw(raw: string | null): Record<string, unknown> | null {
  return parseAudit(raw) as unknown as Record<string, unknown> | null;
}

function backlogCard(l: LeadRow, user: User, _origin: string): string {
  const isAdmin = user.role === "admin";
  const audit = parseAudit(l.audit_data);
  const hot = l.status === "hot_lead" || (l.demo_viewed_count ?? 0) > 0;
  const lockedByOther =
    l.locked_by && l.locked_by !== user.id && l.locked_until && l.locked_until > new Date().toISOString();

  return `<article draggable="${isAdmin ? "true" : "false"}" class="lead-card group bg-white rounded-xl shadow-sm border ${
    hot ? "border-rose-300 ring-2 ring-rose-100/70" : "border-zinc-200/80"
  } p-3.5 space-y-2.5 transition-all duration-150 hover:shadow-md hover:border-zinc-300 cursor-pointer select-none" data-lead="${esc(l.id)}" data-status="${esc(l.status)}">
  <div class="flex items-start justify-between gap-2">
    <div class="min-w-0">
      <div class="flex items-center gap-1.5">
        ${isAdmin ? `<span class="text-zinc-300 hover:text-zinc-500 cursor-grab shrink-0 select-none" title="Glisser pour déplacer">${icon("grip", "w-3 h-3")}</span>` : ""}
        <h3 class="font-bold text-sm text-zinc-900 group-hover:text-indigo-600 truncate transition-colors" title="${esc(l.company_name)}">
          ${esc(l.company_name)}
        </h3>
      </div>
      <div class="flex items-center gap-1.5 flex-wrap mt-0.5 ${isAdmin ? "pl-4" : ""}">
        <p class="text-xs text-zinc-500 truncate flex items-center gap-1">
          <span>${esc(l.activity)}</span>
          <span class="text-zinc-300">·</span>
          <span class="flex items-center gap-0.5">${icon("map-pin", "w-3 h-3 text-zinc-400")} ${esc(l.city)}</span>
        </p>
        ${renderOpportunityBadge(l.opportunity_type)}
        ${renderChannelBadge(l.primary_channel)}
        ${l.duplicate_of ? `<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold border bg-amber-50 text-amber-800 border-amber-200" title="Même SIREN que ${esc(l.duplicate_of)}">Doublon ?</span>` : ""}
      </div>
    </div>
    <div class="flex items-center gap-1 shrink-0">
      ${
        hot
          ? `<span class="bg-rose-50 text-rose-700 border border-rose-200/80 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
               ${icon("flame", "w-2.5 h-2.5 text-rose-500")}
               <span>${l.demo_viewed_count} vues</span>
             </span>`
          : ""
      }
    </div>
  </div>

  <!-- Signaux clés : Avis Google & Audit Technique -->
  <div class="flex items-center justify-between text-xs pt-0.5 ${isAdmin ? "pl-4" : ""}">
    ${renderGoogleRatingBadge(l.google_rating, l.google_reviews_count, true)}
    ${renderAuditScoreBadge(audit?.score, l.website_url)}
  </div>

  ${
    (audit?.paid_ads_detected?.length ?? 0) > 0 || audit?.is_https === false || (audit?.copyright_year && audit.copyright_year <= new Date().getFullYear() - 2)
      ? `<div class="flex flex-wrap gap-1 pt-0.5 ${isAdmin ? "pl-4" : ""}">
           ${(audit?.paid_ads_detected?.length ?? 0) > 0 ? `<span class="text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded">💰 Pub active (${esc(audit!.paid_ads_detected![0])})</span>` : ""}
           ${audit?.is_https === false ? `<span class="text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200 px-1.5 py-0.5 rounded">⚠️ HTTP non sécurisé</span>` : ""}
           ${audit?.copyright_year && audit.copyright_year <= new Date().getFullYear() - 2 ? `<span class="text-[10px] font-semibold bg-zinc-100 text-zinc-700 border border-zinc-200 px-1.5 py-0.5 rounded">🕰️ © ${audit.copyright_year}</span>` : ""}
         </div>`
      : ""
  }

  ${
    l.callback_scheduled_at
      ? `<div class="text-[11px] font-semibold bg-purple-50 text-purple-900 border border-purple-200/80 rounded-lg px-2.5 py-1 flex items-center gap-1.5 ${isAdmin ? "ml-4" : ""}">
           ${icon("clock", "w-3.5 h-3.5 text-purple-600")}
           <span>Relance : ${new Date(l.callback_scheduled_at).toLocaleDateString("fr-FR", {
             day: "2-digit",
             month: "2-digit",
             hour: "2-digit",
             minute: "2-digit",
           })}</span>
         </div>`
      : ""
  }

  ${
    lockedByOther
      ? `<div class="text-[11px] bg-amber-50 text-amber-800 rounded px-2 py-1 flex items-center gap-1 ${isAdmin ? "ml-4" : ""}">${icon("clock", "w-3 h-3")} En appel : ${esc(l.locker_name)}</div>`
      : ""
  }

  ${formatScanDate(l.created_at) ? `<p class="text-[10px] text-zinc-400 ${isAdmin ? "pl-4" : ""}">Scanné le ${formatScanDate(l.created_at)}</p>` : ""}

  <!-- Footer : Assigné & Lien Démo -->
  <div class="pt-2 border-t border-zinc-100 flex items-center justify-between text-xs ${isAdmin ? "pl-4" : ""}">
    ${
      l.assignee_name
        ? `<span class="text-[11px] text-zinc-600 font-medium flex items-center gap-1">
             ${icon("user", "w-3 h-3 text-zinc-400")}
             <span class="truncate max-w-[120px]">${esc(l.assignee_name)}</span>
           </span>`
        : `<span class="text-[11px] text-zinc-400 italic">Non assigné</span>`
    }
    ${renderCardDemoSlot(l, "compact")}
  </div>
</article>`;
}

function calendarCard(l: LeadRow, _user: User, _origin: string): string {
  const d = new Date(l.callback_scheduled_at!);
  const now = new Date();
  const isPast = d.getTime() < now.getTime() && l.status !== "won" && l.status !== "lost";
  const timeStr = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const dateStr = d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });

  const diffMs = d.getTime() - now.getTime();
  const diffHours = Math.round(diffMs / (3600 * 1000));
  const diffDays = Math.round(diffMs / (24 * 3600 * 1000));

  let relative = "";
  let urgencyBg = "bg-purple-100 text-purple-900 border-purple-200";
  if (isPast) {
    const pastHours = Math.abs(diffHours);
    relative = pastHours < 24 ? `En retard de ${pastHours}h` : `En retard de ${Math.abs(diffDays)}j`;
    urgencyBg = "bg-rose-100 text-rose-900 border-rose-200";
  } else if (diffHours < 1) {
    const min = Math.max(1, Math.round(diffMs / 60000));
    relative = `Dans ${min} min`;
    urgencyBg = "bg-amber-100 text-amber-900 border-amber-200";
  } else if (diffHours < 24) {
    relative = `Dans ${diffHours}h`;
  } else {
    relative = `Dans ${diffDays}j`;
  }

  const colDef = COLUMNS.find((c) => c.key === l.status) ?? COLUMNS[0]!;

  return `<article class="lead-card bg-white border ${
    isPast ? "border-rose-300 ring-1 ring-rose-300/40" : "border-zinc-200"
  } rounded-2xl p-4 shadow-sm hover:shadow-md transition-all space-y-3 cursor-pointer group" data-lead="${esc(l.id)}">
    <!-- En-tête : Créneau horaire & Statut -->
    <div class="flex items-center justify-between gap-2 flex-wrap">
      <div class="flex items-center gap-2">
        <div class="px-2.5 py-1 rounded-lg border font-mono font-bold text-xs flex items-center gap-1.5 ${urgencyBg}">
          ${icon("clock", "w-3.5 h-3.5")}
          <span>${timeStr} · ${dateStr}</span>
        </div>
        <span class="text-[11px] font-semibold ${isPast ? "text-rose-600 font-bold" : "text-zinc-500"}">${relative}</span>
      </div>
      <div class="flex items-center gap-1.5">
        <span class="text-xs font-semibold px-2 py-0.5 rounded-full ${colDef.badgeBg}">
          ${colDef.label}
        </span>
        ${renderOpportunityBadge(l.opportunity_type)}
        ${renderChannelBadge(l.primary_channel)}
        ${l.duplicate_of ? `<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold border bg-amber-50 text-amber-800 border-amber-200" title="Même SIREN que ${esc(l.duplicate_of)}">Doublon ?</span>` : ""}
      </div>
    </div>

    <!-- Identité Prospect -->
    <div class="space-y-1">
      <div class="flex items-center justify-between gap-2">
        <h4 class="font-bold text-sm text-zinc-900 group-hover:text-purple-700 transition-colors truncate">
          ${esc(l.company_name)}
        </h4>
        ${renderGoogleRatingBadge(l.google_rating, l.google_reviews_count, false)}
      </div>
      <p class="text-xs text-zinc-500 flex items-center gap-1">
        <span>${esc(l.activity)}</span>
        <span class="text-zinc-300">·</span>
        <span class="flex items-center gap-0.5">${icon("map-pin", "w-3 h-3 text-zinc-400")} ${esc(l.city)}</span>
      </p>
    </div>

    <!-- Dernières notes enregistrées -->
    ${
      l.call_notes
        ? `<div class="bg-zinc-50 border border-zinc-200/80 rounded-xl p-2.5 text-xs text-zinc-700 font-sans leading-relaxed line-clamp-2">
             <span class="font-semibold text-zinc-900">Notes :</span> ${esc(l.call_notes)}
           </div>`
        : `<div class="text-[11px] text-zinc-400 italic">Aucune note saisie lors du précédent appel.</div>`
    }

    <!-- Barre d'actions rapides -->
    <div class="pt-2 border-t border-zinc-100 flex items-center justify-between gap-2 flex-wrap" onclick="event.stopPropagation()">
      <div class="flex items-center gap-1.5 flex-wrap">
        <a href="${telHref(l.phone)}" data-lock="${esc(l.id)}" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors" title="Appeler (pose un verrou de 15 min)">
          ${icon("phone", "w-3.5 h-3.5")}
          <span>${esc(l.phone || "Appeler")}</span>
        </a>

        ${
          l.phone
            ? `<a href="https://wa.me/${toWaNumber(l.phone)}" target="_blank" rel="noopener" class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 transition-colors" title="WhatsApp">
                 ${icon("message", "w-3.5 h-3.5 text-emerald-600")}
               </a>`
            : ""
        }

        <button type="button" class="btn-open-panel inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-zinc-100 hover:bg-zinc-200 text-zinc-800 transition-colors" data-lead="${esc(l.id)}" title="Ouvrir la Battlecard IA et les notes">
          ${icon("zap", "w-3.5 h-3.5 text-amber-500")}
          <span>Battlecard</span>
        </button>

        ${renderCardDemoSlot(l, "button")}
      </div>

      <!-- Actions de décalage rapide & .ics -->
      <div class="flex items-center gap-1">
        <button type="button" class="btn-reschedule px-2 py-1 text-[11px] font-medium rounded-md bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 transition-colors" data-id="${esc(l.id)}" data-hours="1" title="Reprogrammer dans 1h">
          +1h
        </button>
        <button type="button" class="btn-reschedule px-2 py-1 text-[11px] font-medium rounded-md bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 transition-colors" data-id="${esc(l.id)}" data-hours="24" title="Reprogrammer demain à la même heure">
          Demain
        </button>
        <a href="/api/leads/${esc(l.id)}/calendar.ics" download class="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-md transition-colors" title="Télécharger l'événement .ics (Apple Calendar / Outlook)">
          ${icon("calendar", "w-3.5 h-3.5")}
        </a>
      </div>
    </div>
  </article>`;
}

function calendarView(leads: LeadRow[], user: User, origin: string, scope: string, opp = "all"): string {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const tomorrowDate = new Date(now.getTime() + 24 * 3600 * 1000);
  const tomorrowStr = tomorrowDate.toISOString().slice(0, 10);

  const scheduled = leads.filter((l) => !!l.callback_scheduled_at);
  scheduled.sort((a, b) => new Date(a.callback_scheduled_at!).getTime() - new Date(b.callback_scheduled_at!).getTime());

  const overdue = scheduled.filter(
    (l) => new Date(l.callback_scheduled_at!).getTime() < now.getTime() && l.status !== "won" && l.status !== "lost",
  );
  const today = scheduled.filter(
    (l) => l.callback_scheduled_at!.slice(0, 10) === todayStr && new Date(l.callback_scheduled_at!).getTime() >= now.getTime(),
  );
  const tomorrow = scheduled.filter((l) => l.callback_scheduled_at!.slice(0, 10) === tomorrowStr);
  const upcoming = scheduled.filter((l) => l.callback_scheduled_at!.slice(0, 10) > tomorrowStr);

  // Leads Chauds & Top Prospects pour le plan d'action "Ma Journée" intégré
  const hotLeads = leads
    .filter((l) => (l.status === "hot_lead" || (l.demo_viewed_count ?? 0) > 0) && l.status !== "won" && l.status !== "lost")
    .sort((a, b) => (b.demo_viewed_count ?? 0) - (a.demo_viewed_count ?? 0));

  const readyLeads = leads
    .filter((l) => l.status === "demo_ready")
    .sort((a, b) => {
      const aAudit = parseAudit(a.audit_data);
      const bAudit = parseAudit(b.audit_data);
      const aAds = aAudit?.paid_ads_detected?.length ?? 0;
      const bAds = bAudit?.paid_ads_detected?.length ?? 0;
      if (bAds !== aAds) return bAds - aAds;
      return (aAudit?.score ?? 50) - (bAudit?.score ?? 50);
    })
    .slice(0, 9);

  return `
  <div class="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
    <!-- En-tête unifié Ma Journée & Agenda -->
    <div class="bg-white border border-purple-200/80 rounded-2xl p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
      <div class="space-y-1">
        <div class="flex items-center gap-2">
          <div class="p-2 rounded-xl bg-purple-100 text-purple-700">
            ${icon("calendar", "w-5 h-5")}
          </div>
          <h2 class="text-base font-bold text-zinc-900 tracking-tight">Ma Journée & Agenda des Relances</h2>
        </div>
        <p class="text-xs text-zinc-500">
          Vos rendez-vous programmés, vos prospects chauds et vos cibles prioritaires au même endroit.
        </p>
      </div>

      <!-- Synchronisation externe discrète (Google Agenda + Export .ics) -->
      <div class="flex items-center gap-2 flex-wrap">
        <div id="google_agenda_badge" class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-purple-200 bg-purple-50 text-purple-900 text-xs font-medium whitespace-nowrap">
          <span id="google_dot" class="w-2 h-2 rounded-full bg-zinc-400"></span>
          <span id="google_text">Synchro Google</span>
          <a id="google_btn" href="/auth/google" class="text-xs font-semibold text-purple-700 underline hover:text-purple-900 ml-0.5">Lier</a>
        </div>
        <a href="/api/closer/calendar.ics" download class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 shadow-sm transition-colors" title="Exporter l'agenda (.ics) pour Apple Calendar, Outlook ou téléphone">
          ${icon("calendar", "w-3.5 h-3.5 text-purple-600")}
          <span>Exporter .ics</span>
        </a>
      </div>
    </div>

    <!-- Compteurs statistiques de la journée -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div class="bg-rose-50/60 border border-rose-200 rounded-xl p-3 shadow-sm">
        <div class="text-[11px] font-semibold text-rose-700">Rappels en retard / Urgents</div>
        <div class="text-xl font-bold text-rose-800 mt-0.5">${overdue.length}</div>
      </div>
      <div class="bg-purple-50/60 border border-purple-200 rounded-xl p-3 shadow-sm">
        <div class="text-[11px] font-semibold text-purple-700">Rendez-vous Aujourd'hui</div>
        <div class="text-xl font-bold text-purple-800 mt-0.5">${today.length}</div>
      </div>
      <div class="bg-amber-50/60 border border-amber-200 rounded-xl p-3 shadow-sm">
        <div class="text-[11px] font-semibold text-amber-800">🔥 Leads Chauds à closer</div>
        <div class="text-xl font-bold text-amber-900 mt-0.5">${hotLeads.length}</div>
      </div>
      <div class="bg-indigo-50/60 border border-indigo-200 rounded-xl p-3 shadow-sm">
        <div class="text-[11px] font-semibold text-indigo-700">Rendez-vous à venir (Demain +)</div>
        <div class="text-xl font-bold text-indigo-800 mt-0.5">${tomorrow.length + upcoming.length}</div>
      </div>
    </div>

    <!-- 1. TIMELINE DES RENDEZ-VOUS & RELANCES PROGRAMMÉS -->
    ${
      scheduled.length === 0
        ? `<div class="bg-white border border-zinc-200 rounded-2xl p-6 text-center space-y-2 shadow-sm">
             <h3 class="font-bold text-sm text-zinc-900">Aucun rendez-vous de relance programmé pour l'instant</h3>
             <p class="text-xs text-zinc-500 max-w-md mx-auto">
               Ouvrez n'importe quelle fiche prospect ci-dessous ou dans le <a href="/?scope=${scope}&view=backlog&opp=${opp}" class="text-purple-700 font-semibold underline">Kanban</a> pour définir une date de rappel.
             </p>
           </div>`
        : `<div class="space-y-6">
             ${
               overdue.length > 0
                 ? `<section class="space-y-3">
                      <div class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-rose-700">
                        <span class="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></span>
                        <span>Priorité 1 — À rappeler d'urgence (En retard : ${overdue.length})</span>
                      </div>
                      <div class="grid md:grid-cols-2 gap-3.5">
                        ${overdue.map((l) => calendarCard(l, user, origin)).join("")}
                      </div>
                    </section>`
                 : ""
             }

             ${
               today.length > 0
                 ? `<section class="space-y-3">
                      <div class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-purple-950">
                        <span class="w-2.5 h-2.5 rounded-full bg-purple-600"></span>
                        <span>Rendez-vous prévus Aujourd'hui (${today.length})</span>
                      </div>
                      <div class="grid md:grid-cols-2 gap-3.5">
                        ${today.map((l) => calendarCard(l, user, origin)).join("")}
                      </div>
                    </section>`
                 : ""
             }

             ${
               tomorrow.length > 0
                 ? `<section class="space-y-3">
                      <div class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-950">
                        <span class="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
                        <span>Prévus Demain (${tomorrow.length})</span>
                      </div>
                      <div class="grid md:grid-cols-2 gap-3.5">
                        ${tomorrow.map((l) => calendarCard(l, user, origin)).join("")}
                      </div>
                    </section>`
                 : ""
             }

             ${
               upcoming.length > 0
                 ? `<section class="space-y-3">
                      <div class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-700">
                        <span class="w-2.5 h-2.5 rounded-full bg-zinc-400"></span>
                        <span>Créneaux à venir plus tard (${upcoming.length})</span>
                      </div>
                      <div class="grid md:grid-cols-2 gap-3.5">
                        ${upcoming.map((l) => calendarCard(l, user, origin)).join("")}
                      </div>
                    </section>`
                 : ""
             }
           </div>`
    }

    <!-- 2. LEADS CHAUDS À CLOSER AUJOURD'HUI -->
    <section class="bg-white border border-rose-200/80 rounded-2xl p-5 shadow-sm space-y-3">
      <div class="flex items-center justify-between border-b border-rose-100 pb-3">
        <div class="flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping"></span>
          <h3 class="font-bold text-sm text-rose-950 uppercase tracking-wider">Leads Chauds à Closer (${hotLeads.length})</h3>
        </div>
        <span class="text-[11px] font-semibold text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-md border border-rose-200">Ont ouvert leur démo ou cliqué "Intéressé"</span>
      </div>
      ${
        hotLeads.length === 0
          ? `<p class="text-xs text-zinc-500 py-3 text-center">Aucun lead chaud en attente pour l'instant.</p>`
          : `<div class="grid md:grid-cols-2 lg:grid-cols-3 gap-3.5">${hotLeads.map((l) => backlogCard(l, user, origin)).join("")}</div>`
      }
    </section>

    <!-- 3. PROSPECTS PRIORITAIRES PRÊTS À CONTACTER -->
    <section class="bg-white border border-zinc-200 rounded-2xl p-5 shadow-sm space-y-3">
      <div class="flex items-center justify-between border-b border-zinc-100 pb-3">
        <div class="flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-full bg-indigo-600"></span>
          <h3 class="font-bold text-sm text-zinc-900 uppercase tracking-wider">Prochains Appels / Emails Prioritaires (${readyLeads.length})</h3>
        </div>
        <span class="text-[11px] text-zinc-500">Triés par budget pub (Ads) & besoin de refonte</span>
      </div>
      ${
        readyLeads.length === 0
          ? `<p class="text-xs text-zinc-500 py-3 text-center">Aucun nouveau prospect dans la colonne "À contacter".</p>`
          : `<div class="grid md:grid-cols-2 lg:grid-cols-3 gap-3.5">${readyLeads.map((l) => backlogCard(l, user, origin)).join("")}</div>`
      }
    </section>
  </div>`;
}

export function closerPage({ user, leads, scope, view, origin, opp = "all" }: CloserProps): string {
  const isAdmin = user.role === "admin";
  const hotCount = leads.filter((l) => l.status === "hot_lead").length;
  const wonCount = leads.filter((l) => l.status === "won").length;
  const scheduledCount = leads.filter((l) => !!l.callback_scheduled_at).length;

  const scopeTabs: [string, string][] = isAdmin
    ? [
        ["all", `Tous les leads (${leads.length})`],
        ["mine", "Mes assignés"],
        ["unassigned", "Non assignés"],
      ]
    : [
        ["mine", `Mon portefeuille (${leads.length})`],
      ];
  const allowedOpps = parseAllowedOpportunities(user.allowed_opportunities);

  const body = `<div class="w-full min-h-screen bg-zinc-100/70 pb-12">
  <!-- Top Bar Toolbar -->
  <div class="bg-white border-b border-zinc-200/80 px-4 sm:px-6 py-2.5 shadow-sm space-y-2.5">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <!-- Portefeuilles -->
      <nav class="flex items-center gap-1.5 overflow-x-auto">
        ${scopeTabs.map(([k, label]) => `<a href="/?scope=${k}&view=${view}&opp=${opp}" class="whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${scope === k ? "bg-zinc-900 text-white shadow-sm" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900"}">${label}</a>`).join("")}
      </nav>

      <!-- Indicateurs & Sélecteur de Vue -->
      <div class="flex flex-wrap items-center gap-2 text-xs max-w-full">
        <span class="inline-flex items-center gap-1 bg-rose-50 text-rose-700 border border-rose-200 font-semibold px-2.5 py-1 rounded-lg whitespace-nowrap">
          ${icon("flame", "w-3.5 h-3.5 text-rose-500")}
          <span>${hotCount} chaud(s)</span>
        </span>
        <span class="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold px-2.5 py-1 rounded-lg whitespace-nowrap">
          ${icon("check-circle", "w-3.5 h-3.5 text-emerald-600")}
          <span>${wonCount} gagné(s)</span>
        </span>
        
        <div class=" sm:border-l sm:border-zinc-200 sm:pl-2 sm:ml-1 flex flex-wrap items-center gap-1 bg-zinc-100 p-0.5 rounded-lg max-w-full">
          <a href="/?scope=${scope}&view=backlog&opp=${opp}" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-semibold text-xs transition-all whitespace-nowrap ${view === "backlog" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-900"}">
            ${icon("layers", "w-3.5 h-3.5 text-zinc-500")} Backlog Kanban
          </a>
          <a href="/?scope=${scope}&view=list&opp=${opp}" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-semibold text-xs transition-all whitespace-nowrap ${view === "list" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-900"}">
            ${icon("file-text", "w-3.5 h-3.5 text-zinc-500")} Liste
          </a>
          <a href="/?scope=${scope}&view=calendar&opp=${opp}" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-semibold text-xs transition-all whitespace-nowrap ${view === "calendar" ? "bg-purple-700 text-white shadow-sm" : "text-zinc-600 hover:text-zinc-900"}">
            ${icon("calendar", `w-3.5 h-3.5 ${view === "calendar" ? "text-white" : "text-purple-600"}`)}
            <span>Ma Journée & Agenda</span>
            ${scheduledCount ? `<span class="px-1.5 py-0.5 rounded-full text-[10px] ${view === "calendar" ? "bg-purple-900 text-white" : "bg-purple-100 text-purple-800"} font-bold">${scheduledCount}</span>` : ""}
          </a>
        </div>
      </div>
    </div>

    <!-- Barre de Filtre par Opportunité / Type de Besoin -->
    <div class="flex items-center gap-1.5 pt-2 border-t border-zinc-100 overflow-x-auto text-xs">
      <span class="text-[11px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1 mr-1">
        ${icon("target", "w-3 h-3 text-zinc-500")} Besoin :
      </span>
      ${(isAdmin
        ? [
            ["all", "Tous les besoins"],
            ...OPPORTUNITY_TYPES.map((o) => [o.id, o.badge] as [string, string]),
          ]
        : [
            ["all", `Tous mes besoins (${allowedOpps.length})`],
            ...OPPORTUNITY_TYPES.filter((o) => (allowedOpps as string[]).includes(o.id)).map((o) => [o.id, o.badge] as [string, string]),
          ]
      )
        .map(([k, label]) => `<a href="/?scope=${scope}&view=${view}&opp=${k}" class="whitespace-nowrap px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${opp === k ? "bg-indigo-600 text-white shadow-sm" : "bg-zinc-50 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 border border-zinc-200/80"}">${label}</a>`)
        .join("")}
    </div>
  </div>

  ${
    view === "backlog"
      ? `<!-- Vue Backlog Pipeline Kanban (Glisser-Déposer entre colonnes pour admin, boutons guidés pour closer) -->
  <div class="p-3 text-xs text-zinc-500 max-w-full text-center flex items-center justify-center gap-1.5">
    ${icon("zap", "w-3.5 h-3.5 text-zinc-400")}
    ${
      isAdmin
        ? `<span class="font-semibold text-zinc-800">Mode Administrateur</span> : Glissez-déposez librement les cartes entre les colonnes ou cliquez sur une fiche pour ouvrir le panneau complet.`
        : `<span class="font-semibold text-zinc-800">Séquence Closer Guidée</span> : Suivez le cycle de vie du prospect via les boutons d'action (Appel ➔ Relance ➔ Vente) ou cliquez sur la fiche pour le détail.`
    }
  </div>
  <div class="flex overflow-x-auto gap-4 px-4 sm:px-6 pb-6 items-start snap-x snap-mandatory">
    ${COLUMNS.map((col) => {
      const colLeads = leads.filter((l) => l.status === col.key);
      return `<div class="kanban-col w-80 shrink-0 bg-zinc-200/50 border border-zinc-200 rounded-2xl p-3 space-y-3 ${col.borderAccent} shadow-sm snap-start transition-all" data-status="${col.key}">
        <div class="flex items-center justify-between px-1">
          <div class="flex items-center gap-2 font-semibold text-sm text-zinc-900">
            <span class="text-zinc-600">${icon(col.icon, "w-4 h-4")}</span>
            <span>${col.label}</span>
          </div>
          <span class="col-badge text-xs font-semibold px-2 py-0.5 rounded-full ${col.badgeBg}">${colLeads.length}</span>
        </div>
        <div class="kanban-cards space-y-3 min-h-[220px]" data-status="${col.key}">
          ${colLeads.map((l) => backlogCard(l, user, origin)).join("")}
          <div class="empty-placeholder border-2 border-dashed border-zinc-300 rounded-xl p-8 text-center text-xs text-zinc-400 font-medium ${colLeads.length ? "hidden" : ""}">
            Déposez un lead ici
          </div>
        </div>
      </div>`;
    }).join("")}
  </div>`
      : view === "calendar"
        ? calendarView(leads, user, origin, scope, opp)
        : `<!-- Vue Liste classique -->
  <div class="max-w-4xl mx-auto p-4 space-y-3">
    ${leads.length ? leads.map((l) => backlogCard(l, user, origin)).join("") : `<p class="text-center text-zinc-500 py-16">Aucun lead trouvé.</p>`}
  </div>`
  }

  <!-- ======================================================== -->
  <!-- PANNEAU LATÉRAL (SIDEPANEL DRAWER)                       -->
  <!-- ======================================================== -->
  <div id="sp_backdrop" class="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm z-40 hidden opacity-0 transition-opacity duration-300"></div>

  <aside id="sidepanel" class="fixed inset-y-0 right-0 w-full sm:w-[500px] lg:w-[560px] bg-white shadow-2xl z-50 transform translate-x-full transition-transform duration-300 ease-in-out border-l border-zinc-200 flex flex-col font-sans">
    <!-- En-tête fixe : identité, canal, numéro, démo -->
    <header class="bg-zinc-950 text-zinc-50 px-5 pt-4 pb-3.5 space-y-3 shrink-0">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <h2 id="sp_company_name" class="font-extrabold text-lg tracking-tight truncate">Nom du prospect</h2>
          <p id="sp_activity_city" class="text-[13px] text-zinc-400 truncate">Activité · Ville</p>
        </div>
        <button type="button" id="sp_close" class="w-9 h-9 shrink-0 rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 flex items-center justify-center" aria-label="Fermer le panneau" title="Fermer (Échap)">
          ${icon("x", "w-4 h-4")}
        </button>
      </div>
      <div class="flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
        <span id="sp_opp_badge" class="px-2 py-0.5 rounded-md">🌐 Site Web</span>
        <span id="sp_channel_badge" class="hidden px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-200"></span>
        <span id="sp_rating" class="px-2 py-0.5 rounded-md bg-zinc-800 text-amber-200">★ <span id="sp_rating_text">–</span></span>
        <span id="sp_status_badge" class="px-2 py-0.5 rounded-md">Statut</span>
        <span id="sp_views_badge" class="hidden items-center gap-1 px-2 py-0.5 rounded-md bg-rose-600 text-white">
          ${icon("flame", "w-3 h-3")}
          <span id="sp_views_badge_text">0 vue(s)</span>
        </span>
      </div>
      <div class="flex gap-2">
        <a id="sp_head_call" href="#" class="flex-1 min-w-0 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center justify-center gap-2 transition-colors">
          ${icon("phone", "w-4 h-4")} <span id="sp_head_call_text" class="font-mono truncate">Appeler</span>
        </a>
        <a id="sp_head_demo" href="#" target="_blank" rel="noopener" class="h-11 px-4 rounded-xl border border-zinc-700 hover:bg-zinc-800 text-zinc-50 font-semibold text-sm flex items-center gap-1.5">
          ${icon("eye", "w-4 h-4")} Démo ↗
        </a>
      </div>
      <p id="sp_head_demo_info" class="text-[11px] text-zinc-400"></p>
      <p id="sp_duplicate" class="hidden text-xs font-semibold text-amber-200 bg-amber-900/40 border border-amber-700/60 rounded-lg px-3 py-2"></p>
    </header>

    <!-- Onglets : un par moment de l'appel -->
    <nav id="sp_tabs" class="flex border-b border-zinc-200 bg-zinc-50 px-2 shrink-0" aria-label="Sections du lead">
      <button type="button" data-sp-tab="appel" class="sp-tab flex-1 h-11 text-sm">Appel</button>
      <button type="button" data-sp-tab="ecrit" class="sp-tab flex-1 h-11 text-sm">Écrit</button>
      <button type="button" data-sp-tab="prospect" class="sp-tab flex-1 h-11 text-sm">Prospect</button>
      <button type="button" data-sp-tab="suivi" class="sp-tab flex-1 h-11 text-sm">Suivi</button>
      <button type="button" data-sp-tab="closing" class="sp-tab flex-1 h-11 text-sm">Closing</button>
    </nav>

    <div class="flex-1 overflow-y-auto p-5">

      <!-- ONGLET APPEL : tient sur un écran -->
      <div data-sp-pane="appel" class="space-y-4">
        <section class="space-y-1">
          <p class="text-[11px] font-extrabold uppercase tracking-wider text-zinc-500">En deux mots</p>
          <p id="sp_audit_summary" class="text-sm leading-relaxed text-zinc-800"></p>
          <p id="sp_key_people_badge" class="hidden text-[13px] text-zinc-700"></p>
        </section>
        <section class="rounded-xl bg-indigo-50 border border-indigo-200 p-4 space-y-2">
          <div class="flex items-center justify-between gap-2">
            <p class="text-[11px] font-extrabold uppercase tracking-wider text-indigo-800">Accroche · 30 secondes</p>
            <button type="button" id="sp_copy_script" class="h-8 px-3 rounded-lg border border-indigo-300 bg-white text-indigo-800 text-xs font-bold">Copier</button>
          </div>
          <p id="sp_script" class="whitespace-pre-line text-[15px] leading-relaxed text-indigo-950"></p>
        </section>
        <section class="space-y-2">
          <p class="text-[11px] font-extrabold uppercase tracking-wider text-zinc-500">Arguments</p>
          <ul id="sp_our_advantages" class="space-y-1.5 text-sm text-zinc-800"></ul>
        </section>
        <section class="space-y-2">
          <p class="text-[11px] font-extrabold uppercase tracking-wider text-zinc-500">Objections</p>
          <div id="sp_objections" class="border border-zinc-200 rounded-xl divide-y divide-zinc-100"></div>
        </section>
        <section class="border-t border-zinc-200 pt-4 space-y-2.5">
          <p class="text-[11px] font-extrabold uppercase tracking-wider text-zinc-500">Issue de l'appel</p>
          <div class="grid grid-cols-2 gap-2">
            <button type="button" data-outcome="interested" class="sp-outcome min-h-11 rounded-xl border border-zinc-300 bg-white font-bold text-sm transition-colors text-emerald-700">Intéressé</button>
            <button type="button" data-outcome="callback" class="sp-outcome min-h-11 rounded-xl border border-zinc-300 bg-white font-bold text-sm transition-colors text-indigo-700">Rappeler…</button>
            <button type="button" data-outcome="voicemail" class="sp-outcome min-h-11 rounded-xl border border-zinc-300 bg-white font-bold text-sm transition-colors text-zinc-700">Messagerie</button>
            <button type="button" data-outcome="lost" class="sp-outcome min-h-11 rounded-xl border border-zinc-300 bg-white font-bold text-sm transition-colors text-rose-700">Pas intéressé</button>
          </div>
          <label for="sp_quick_note" class="block text-xs font-semibold text-zinc-700">Note rapide (ajoutée à l'historique)</label>
          <input id="sp_quick_note" placeholder="Ex : rappeler jeudi matin, le gérant décide" class="w-full h-11 border border-zinc-300 rounded-xl px-3 text-sm">
          <p id="sp_outcome_msg" class="text-xs text-zinc-600">Un clic enregistre l'issue, la note et met à jour l'étape.</p>
        </section>
      </div>

      <!-- ONGLET ÉCRIT : email et formulaire -->
      <div data-sp-pane="ecrit" class="space-y-4 hidden">
      <!-- 4a-bis. Formulaire de contact du prospect (soumission manuelle) -->
      <div id="sp_form_block" class="hidden border border-amber-200 rounded-xl p-4 space-y-2 bg-amber-50/40 shadow-sm">
        <h3 class="font-semibold text-xs uppercase tracking-wider text-amber-950 flex items-center gap-1.5">
          📝 Formulaire de contact du prospect
        </h3>
        <p class="text-[11px] text-zinc-600">Pas d'email trouvé ou formulaire préféré : ouvrez le formulaire, collez le message ci-dessous (copié automatiquement), envoyez-le vous-même puis marquez-le comme soumis.</p>
        <p id="sp_form_captcha" class="hidden text-[11px] text-amber-800 font-semibold"></p>
        <div class="grid grid-cols-2 gap-2 pt-1">
          <button type="button" id="sp_open_form" class="bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 px-3 rounded-lg text-xs transition-colors shadow-sm">
            Ouvrir le formulaire (copie le message)
          </button>
          <button type="button" id="sp_mark_form_submitted" class="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-3 rounded-lg text-xs transition-colors shadow-sm">
            ✓ Marquer comme soumis
          </button>
        </div>
        <span id="sp_form_feedback" class="text-[11px] text-emerald-600 font-bold"></span>
      </div>

      <!-- 4a. Email d'Approche Asynchrone (Dev-to-Dev / Agences) -->
      <div id="sp_async_email_block" class="border border-indigo-200 rounded-xl p-4 space-y-3 bg-indigo-50/40 shadow-sm">
        <div class="flex items-center justify-between">
          <h3 class="font-semibold text-xs uppercase tracking-wider text-indigo-950 flex items-center gap-1.5">
            ${icon("mail", "w-3.5 h-3.5 text-indigo-600")} Email — Relecture avant envoi
          </h3>
          <span class="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded border border-amber-200">Aucun envoi automatique</span>
        </div>
        <p class="text-[11px] text-zinc-500">Choisissez un modèle, relisez et modifiez le brouillon. Rien ne part sans votre action.</p>
        <div class="space-y-2.5 text-xs">
          <div>
            <label class="font-semibold text-zinc-700 block mb-1">Modèle :</label>
            <select id="sp_tpl_select" class="w-full border border-indigo-200 rounded-lg px-3 py-2 text-xs bg-white font-medium"></select>
          </div>
          <div>
            <label class="font-semibold text-zinc-700 block mb-1">Destinataire :</label>
            <input id="sp_email_to" type="email" placeholder="contact@agence.fr" class="w-full border border-indigo-200 rounded-lg px-3 py-2 text-xs bg-white font-mono">
          </div>
          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="font-semibold text-zinc-700">Objet :</label>
              <button type="button" id="sp_copy_subject" class="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer">Copier l'objet</button>
            </div>
            <input id="sp_email_subject" class="w-full font-mono text-xs bg-white p-2.5 rounded-lg border border-indigo-200 text-zinc-900 font-semibold">
          </div>
          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="font-semibold text-zinc-700">Corps du message :</label>
              <button type="button" id="sp_copy_body" class="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer">Copier le corps</button>
            </div>
            <textarea id="sp_email_body" rows="14" class="w-full font-mono text-xs bg-white p-3 rounded-lg border border-indigo-200 text-zinc-800 leading-relaxed"></textarea>
            <p id="sp_tpl_warning" class="hidden text-[11px] text-amber-700 font-semibold mt-1"></p>
          </div>
          <div class="pt-1 grid grid-cols-2 gap-2">
            <a id="sp_open_mailto" href="#" class="text-center bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-3 rounded-lg text-xs transition-colors shadow-sm">
              ✉️ Ouvrir dans mon client mail
            </a>
            <button type="button" id="sp_mark_sent" class="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-3 rounded-lg text-xs transition-colors shadow-sm">
              ✓ Marquer comme envoyé
            </button>
          </div>
          <span id="sp_copy_feedback" class="text-[11px] text-emerald-600 font-bold"></span>
        </div>
      </div>

        <section class="border-t border-zinc-200 pt-4 space-y-2.5">
          <div class="flex items-center justify-between gap-2">
            <p class="text-[11px] font-extrabold uppercase tracking-wider text-zinc-500">Réponse du prospect</p>
            <button type="button" id="sp_reply_toggle" class="h-9 px-3 rounded-lg border border-zinc-300 text-xs font-bold text-zinc-800 hover:bg-zinc-50">+ Réponse reçue</button>
          </div>
          <div id="sp_reply_form" class="hidden space-y-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            <div class="grid grid-cols-2 gap-2">
              <label class="text-xs font-semibold text-zinc-700 space-y-1">Reçue par
                <select id="sp_reply_channel" class="w-full h-10 border border-zinc-300 rounded-lg px-2 text-sm font-normal bg-white">
                  <option value="email">Email</option>
                  <option value="contact_form">Formulaire</option>
                  <option value="phone">Téléphone</option>
                </select>
              </label>
              <label class="text-xs font-semibold text-zinc-700 space-y-1">De (facultatif)
                <input id="sp_reply_from" placeholder="Nom ou adresse" class="w-full h-10 border border-zinc-300 rounded-lg px-2 text-sm font-normal bg-white">
              </label>
            </div>
            <label class="block text-xs font-semibold text-zinc-700 space-y-1">Texte de la réponse
              <textarea id="sp_reply_text" rows="5" placeholder="Collez ici la réponse du prospect" class="w-full border border-zinc-300 rounded-lg p-2 text-[13px] font-normal bg-white"></textarea>
            </label>
            <div class="flex items-center gap-2">
              <button type="button" id="sp_reply_save" class="h-10 px-4 rounded-lg bg-zinc-900 text-white text-sm font-bold">Enregistrer la réponse</button>
              <span id="sp_reply_msg" class="text-xs"></span>
            </div>
          </div>
          <div class="grid grid-cols-3 gap-2">
            <button type="button" data-outcome="interested" class="sp-outcome min-h-11 rounded-xl border border-zinc-300 bg-white font-bold text-sm transition-colors text-emerald-700">Intéressé</button>
            <button type="button" data-outcome="callback" class="sp-outcome min-h-11 rounded-xl border border-zinc-300 bg-white font-bold text-sm transition-colors text-indigo-700">Relancer…</button>
            <button type="button" data-outcome="lost" class="sp-outcome min-h-11 rounded-xl border border-zinc-300 bg-white font-bold text-sm transition-colors text-rose-700">Refus / STOP</button>
          </div>
        </section>
      </div>

      <!-- ONGLET PROSPECT : coordonnées, site actuel -->
      <div data-sp-pane="prospect" class="space-y-4 hidden">
      <!-- 1. Coordonnées éditables & Envoi Direct -->
      <div class="bg-zinc-50/70 border border-zinc-200 rounded-xl p-4 space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="font-semibold text-xs uppercase tracking-wider text-zinc-700 flex items-center gap-1.5">
            ${icon("phone", "w-3.5 h-3.5 text-zinc-500")} Coordonnées & Contact
          </h3>
          <span class="text-[11px] text-zinc-400 font-mono">Édition instantanée</span>
        </div>

        <div class="grid sm:grid-cols-2 gap-2.5">
          <div>
            <label class="text-[11px] font-semibold text-zinc-600 block mb-1">Téléphone :</label>
            <input id="sp_phone" placeholder="06..." class="w-full border border-zinc-200 rounded-lg px-3 py-2 text-xs font-medium bg-white focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-all">
          </div>
          <div>
            <label class="text-[11px] font-semibold text-zinc-600 block mb-1">Email :</label>
            <input id="sp_email" placeholder="contact@prospect.fr" class="w-full border border-zinc-200 rounded-lg px-3 py-2 text-xs font-medium bg-white focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-all">
          </div>
        </div>

        <!-- Boutons d'actions rapides -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1">
          <a id="sp_link_call" href="#" class="inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg py-2 text-xs font-semibold shadow-sm transition-colors">
            ${icon("phone", "w-3.5 h-3.5")} Appeler
          </a>
          <a id="sp_link_wa" href="#" target="_blank" rel="noopener" class="inline-flex items-center justify-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg py-2 text-xs font-semibold shadow-sm transition-colors">
            ${icon("message", "w-3.5 h-3.5")} WhatsApp
          </a>
          <a id="sp_link_mail" href="#" class="inline-flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 text-xs font-semibold shadow-sm transition-colors">
            ${icon("mail", "w-3.5 h-3.5")} Email
          </a>
          <a id="sp_link_sms" href="#" class="inline-flex items-center justify-center gap-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg py-2 text-xs font-semibold shadow-sm transition-colors">
            ${icon("message", "w-3.5 h-3.5")} SMS
          </a>
        </div>

        <div class="flex items-center justify-between pt-1">
          <a id="sp_link_flyer" href="#" target="_blank" class="text-xs text-indigo-600 hover:text-indigo-800 font-semibold inline-flex items-center gap-1 transition-colors">
            ${icon("file-text", "w-3.5 h-3.5")} Télécharger Flyer QR PDF
          </a>
          <button type="button" id="sp_save_contacts" class="text-xs bg-zinc-900 hover:bg-zinc-800 text-white font-semibold px-3.5 py-1.5 rounded-lg shadow-sm transition-all inline-flex items-center gap-1.5">
            ${icon("save", "w-3.5 h-3.5")} Enregistrer
          </button>
        </div>
        <div id="sp_contacts_msg" class="text-[11px] font-semibold"></div>
      </div>

        <section class="space-y-1.5">
          <p class="text-[11px] font-extrabold uppercase tracking-wider text-zinc-500">Généré par</p>
          <ul id="sp_generated_by" class="text-[13px] text-zinc-800 space-y-0.5"></ul>
        </section>
        <section class="space-y-1.5">
          <div class="flex items-center justify-between gap-2">
            <p class="text-[11px] font-extrabold uppercase tracking-wider text-zinc-500">Site actuel</p>
            <a id="sp_old_site_url" href="#" target="_blank" rel="noopener" class="text-sm font-semibold text-indigo-700 hover:underline"></a>
          </div>
          <div id="sp_old_site_status" class="text-xs"></div>
          <ul id="sp_old_site_weaknesses" class="list-disc pl-5 text-[13px] text-zinc-800 space-y-0.5"></ul>
        </section>
      </div>

      <!-- ONGLET SUIVI : étape, relance, historique -->
      <div data-sp-pane="suivi" class="space-y-4 hidden">
      <!-- 0. Action Étape Suivante (Process Commercial Guidé Closer & Admin) -->
      <div id="sp_step_box" class="bg-zinc-900 text-white rounded-xl p-4 space-y-3 shadow-sm">
        <div class="flex items-center justify-between">
          <span class="text-[11px] uppercase tracking-wider text-zinc-400 font-bold flex items-center gap-1.5">
            ${icon("zap", "w-3.5 h-3.5 text-amber-400")} Process Commercial Guidé
          </span>
          <span id="sp_current_step_label" class="text-xs font-semibold text-zinc-300"></span>
        </div>
        <div id="sp_step_actions" class="space-y-2"></div>
      </div>

      <!-- 3. Agenda & Reprogrammation d'Appel -->
      <div class="bg-purple-50/40 border border-purple-200 rounded-xl p-4 space-y-3">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <h3 class="font-semibold text-xs uppercase tracking-wider text-purple-950 flex items-center gap-1.5">
            ${icon("calendar", "w-3.5 h-3.5 text-purple-700")} Agenda & Relance Programmée
          </h3>
          <div class="flex items-center gap-2 text-[11px]">
            <a id="sp_download_ics" href="#" download class="hidden text-purple-800 font-bold hover:underline inline-flex items-center gap-1" title="Télécharger l'événement .ics (Apple Calendar, Outlook, Android)">
              ${icon("calendar", "w-3 h-3")} .ics
            </a>
            <button type="button" id="sp_open_gcalendar" class="text-purple-700 font-semibold hover:underline inline-flex items-center gap-0.5" title="Ajouter aussi dans Google Agenda">
              + Google Agenda ↗
            </button>
            <a href="/?view=calendar" class="text-purple-700 font-semibold hover:underline inline-flex items-center gap-0.5">
              Voir l'Agenda →
            </a>
          </div>
        </div>

        <div class="grid sm:grid-cols-2 gap-2.5">
          <div>
            <label class="text-[11px] font-semibold text-zinc-700 block mb-1">Date & Heure de Relance :</label>
            <input id="sp_callback_at" type="datetime-local" class="w-full border border-purple-200 rounded-lg px-3 py-2 text-xs bg-white font-medium focus:ring-1 focus:ring-purple-600 focus:border-purple-600">
          </div>
          <div>
            <label class="text-[11px] font-semibold text-zinc-700 block mb-1">Changer l'Étape :</label>
            <select id="sp_stage_select" class="w-full border border-purple-200 rounded-lg px-3 py-2 text-xs bg-white font-medium focus:ring-1 focus:ring-purple-600 focus:border-purple-600">
              ${COLUMNS.map((c) => `<option value="${c.key}">${c.label}</option>`).join("")}
            </select>
          </div>
        </div>

        <div>
          <label class="text-[11px] font-semibold text-zinc-700 block mb-1">Notes libres :</label>
          <textarea id="sp_call_notes" rows="3" placeholder="Compte-rendu de l'échange, objections du prospect, créneau convenu..." class="w-full border border-purple-200 rounded-lg p-2.5 text-xs bg-white focus:ring-1 focus:ring-purple-600 focus:border-purple-600"></textarea>
        </div>

        <div class="flex items-center justify-between pt-1">
          <button type="button" id="sp_save_agenda" class="text-xs bg-purple-700 hover:bg-purple-800 text-white font-semibold px-4 py-2 rounded-lg shadow-sm transition-colors inline-flex items-center gap-1.5">
            ${icon("save", "w-3.5 h-3.5")} Enregistrer Relance & Notes
          </button>
          <span id="sp_agenda_msg" class="text-[11px] font-semibold"></span>
        </div>
      </div>
        <section class="space-y-2">
          <div class="flex items-center justify-between gap-2">
            <p class="text-[11px] font-extrabold uppercase tracking-wider text-zinc-500">Historique des échanges</p>
            <span id="sp_timeline_count" class="text-[11px] text-zinc-500"></span>
          </div>
          <ol id="sp_timeline" class="space-y-2"></ol>
        </section>
      </div>

      <!-- ONGLET CLOSING : paiement et démo -->
      <div data-sp-pane="closing" class="space-y-4 hidden">
      <!-- 5. Closing & Lien Stripe (3 Paliers d'Offres) -->
      <div class="border border-violet-200 rounded-xl p-4 bg-violet-50/40 space-y-3">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <h3 class="font-semibold text-xs uppercase tracking-wider text-violet-950 flex items-center gap-1.5">
            ${icon("credit-card", "w-3.5 h-3.5 text-violet-700")} Clôture & Paiement Stripe (3 Offres)
          </h3>
          <span id="sp_stripe_price_badge" class="text-xs font-bold text-violet-800 bg-violet-100 border border-violet-200 px-2 py-0.5 rounded">490 € HT (+ 39 €/mois)</span>
        </div>
        <p class="text-xs text-zinc-600">Sélectionnez la formule retenue avec le client (NDD .fr/.com + SSL + retouches inclus) pour générer le lien Stripe Checkout.</p>
        <div class="space-y-2">
          <label class="text-[11px] font-semibold text-violet-950 block">Formule / Offre choisie :</label>
          <select id="sp_offer_tier" class="w-full border border-violet-200 rounded-lg px-3 py-2 text-xs bg-white font-semibold text-zinc-900 focus:ring-1 focus:ring-violet-600">
            <option value="static" data-badge="490 € HT (+ 39 €/mois)">Formule 1 — Site Vitrine Statique Clé-en-Main (490 € HT · NDD & retouches inclus)</option>
            <option value="admin_cms" data-badge="1 290 € HT (+ 59 €/mois)">Formule 2 — Site Dynamique avec Panneau d'Admin (1 290 € HT · Autonomie photos/actus)</option>
            <option value="custom" data-badge="Sur Devis / Sur-Mesure">Formule 3 — Dév. Spécifique / E-Commerce / Synchro Compta (Sur-Mesure)</option>
          </select>
          <div id="sp_custom_amount_wrap" class="hidden pt-1">
            <label class="text-[11px] font-semibold text-violet-950 block mb-1">Montant convenu sur devis (€) :</label>
            <input id="sp_custom_amount" type="number" min="100" step="10" value="2900" placeholder="Ex: 2900" class="w-full border border-violet-200 rounded-lg px-3 py-2 text-xs bg-white font-mono font-bold text-zinc-900">
          </div>
        </div>
        <div class="pt-1 flex flex-wrap items-center gap-2">
          <button type="button" id="sp_btn_stripe" class="text-xs bg-violet-600 hover:bg-violet-700 text-white font-semibold px-4 py-2 rounded-lg shadow-sm transition-colors inline-flex items-center gap-1.5">
            ${icon("credit-card", "w-3.5 h-3.5")} Générer le Lien Stripe
          </button>
          <span id="sp_stripe_result" class="text-xs"></span>
        </div>
      </div>
        <section class="border border-zinc-200 rounded-xl p-4 space-y-2.5">
          <div class="flex items-center justify-between gap-2">
            <p class="text-[11px] font-extrabold uppercase tracking-wider text-zinc-500">Démo</p>
            <span id="sp_demo_expiry_badge" class="text-[11px]">Active</span>
          </div>
          <a id="sp_demo_url" href="#" target="_blank" rel="noopener" class="flex items-center justify-center gap-1.5 h-10 rounded-lg border border-zinc-300 text-sm font-semibold hover:bg-zinc-50">
            ${icon("eye", "w-4 h-4")} Ouvrir la démo en plein écran ↗
          </a>
          <div class="grid grid-cols-2 gap-2">
            <button type="button" id="sp_btn_extend_demo" class="h-10 rounded-lg border border-zinc-300 text-sm font-semibold hover:bg-zinc-50">Prolonger (+5 jours)</button>
            <button type="button" id="sp_btn_revoke_demo" class="h-10 rounded-lg border border-rose-200 bg-rose-50 text-rose-800 text-sm font-semibold hover:bg-rose-100">Invalider la démo</button>
          </div>
        </section>
      </div>
    </div>
  </aside>
</div>

<script>
var $ = function (id) { return document.getElementById(id); };

// ========================================================
// 0. DONNÉES EN CACHE & MAP DES LEADS
// ========================================================
var IS_ADMIN = ${isAdmin};
var ALL_OPPORTUNITIES = ${JSON.stringify(OPPORTUNITY_TYPES)};
var EMAIL_TEMPLATES = ${JSON.stringify(EMAIL_TEMPLATES)};
var LEADS_MAP = ${JSON.stringify(
  leads.reduce((acc, l) => {
    acc[l.id] = {
      id: l.id,
      company_name: l.company_name,
      activity: l.activity || "",
      city: l.city || "",
      phone: l.phone || "",
      email: l.email || "",
      website_url: l.website_url || "",
      google_rating: l.google_rating,
      google_reviews_count: l.google_reviews_count || 0,
      status: l.status,
      opportunity_type: opportunityIdOf(l.opportunity_type),
      primary_channel: l.primary_channel || "",
      duplicate_of: l.duplicate_of || "",
      generated_by: describeGeneration(l.generated_by),
      scanned_on: formatScanDate(l.created_at),
      contact_form_url: l.contact_form_url || "",
      contact_form_captcha: parseFormMeta(l.contact_form_meta).captcha,
      callback_scheduled_at: l.callback_scheduled_at || "",
      call_notes: l.call_notes || "",
      demo_viewed_count: l.demo_viewed_count || 0,
      demo_revoked: l.demo_revoked || 0,
      demo_expires_at: l.demo_expires_at || "",
      demo_url: `${origin}/demos/${l.id}`,
      flyer_url: l.flyer_pdf_url || "",
      audit: parseAudit(l.audit_data),
      battlecard: parseCard(l.battlecard_data),
      tpl_vars: buildTemplateVars({
        company_name: l.company_name,
        website_url: l.website_url,
        city: l.city,
        activity: l.activity,
        demo_url: `${origin}/demos/${l.id}`,
        audit: parseAuditRaw(l.audit_data),
      }),
    };
    return acc;
  }, {} as Record<string, unknown>),
)};

var COLUMNS_MAP = ${JSON.stringify(
  COLUMNS.reduce((acc, c) => {
    acc[c.key] = { label: c.label, icon: c.icon, badgeBg: c.badgeBg };
    return acc;
  }, {} as Record<string, unknown>),
)};

function toWaNumber(phone) {
  var d = (phone || '').replace(/[^0-9+]/g, '');
  if (d.startsWith('+')) return d.slice(1);
  if (d.startsWith('00')) return d.slice(2);
  if (d.startsWith('0')) return '33' + d.slice(1);
  return d;
}

// ========================================================
// 1. GESTION DU PANNEAU LATÉRAL (SIDEPANEL)
// ========================================================
var activeLeadId = null;

function updateContactLinks(lead) {
  var phone = lead.phone || '';
  var email = lead.email || '';
  var demoUrl = lead.demo_url;
  var waText = (lead.battlecard && lead.battlecard.whatsappText) ? lead.battlecard.whatsappText : ('Bonjour, voici la démo de votre nouveau site : ' + demoUrl);
  if (!waText.includes(demoUrl)) waText += ' ' + demoUrl;

  $('sp_link_call').href = phone ? ('tel:' + phone.replace(/[^0-9+]/g, '')) : '#';
  $('sp_link_call').onclick = phone ? async function(e) {
    e.preventDefault();
    await fetch('/api/leads/' + lead.id + '/lock', { method: 'POST' });
    window.location.href = 'tel:' + phone.replace(/[^0-9+]/g, '');
  } : function(e) { e.preventDefault(); alert('Veuillez d\\'abord renseigner un numéro de téléphone.'); };

  $('sp_link_wa').href = phone ? ('https://wa.me/' + toWaNumber(phone) + '?text=' + encodeURIComponent(waText)) : '#';
  $('sp_link_wa').onclick = phone ? null : function(e) { e.preventDefault(); alert('Veuillez d\\'abord renseigner un numéro de téléphone.'); };

  $('sp_link_sms').href = phone ? ('sms:' + phone.replace(/[^0-9+]/g, '') + '?&body=' + encodeURIComponent(waText)) : '#';
  $('sp_link_sms').onclick = phone ? null : function(e) { e.preventDefault(); alert('Veuillez d\\'abord renseigner un numéro de téléphone.'); };

  var mailSubject = encodeURIComponent('Refonte moderne de votre site internet - ' + lead.company_name);
  var mailLines = [
    'Bonjour,',
    '',
    'Nous avons conçu une proposition de refonte moderne pour votre établissement.',
    'Découvrez votre démo personnalisée ici : ' + demoUrl,
    '',
    'Restant à votre disposition,',
    "L'équipe LeadEngine"
  ];
  var mailBody = encodeURIComponent(mailLines.join('\\n'));
  $('sp_link_mail').href = email ? ('mailto:' + email + '?subject=' + mailSubject + '&body=' + mailBody) : '#';
  $('sp_link_mail').onclick = email ? null : function(e) { e.preventDefault(); alert('Veuillez d\\'abord renseigner une adresse email.'); };

  // WhatsApp et SMS n'ont de sens que pour un numéro mobile.
  var mobile = isMobileNumber(phone);
  $('sp_link_wa').classList.toggle('hidden', !mobile);
  $('sp_link_sms').classList.toggle('hidden', !mobile);
}

function renderSidepanelStepActions(lead) {
  var box = $('sp_step_actions');
  var label = $('sp_current_step_label');
  if (!box) return;

  var col = COLUMNS_MAP[lead.status] || { label: lead.status };
  if (label) label.textContent = 'Actuel : ' + col.label;

  if (IS_ADMIN) {
    box.innerHTML = '<p class="text-[11px] text-zinc-400">Mode Admin : Vous pouvez modifier l\\'étape dans la section Agenda ci-dessous ou glisser la carte sur le Kanban.</p>';
    return;
  }

  var html = '';
  switch (lead.status) {
    case 'demo_ready':
    case 'hot_lead':
      html = '<div class="grid grid-cols-2 gap-2">' +
        '<button type="button" data-next-step="called" class="sp-step-btn bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-3 rounded-lg text-xs shadow-sm flex items-center justify-center gap-1.5 transition-all">☎ Appel Effectué ➔</button>' +
        '<button type="button" class="sp-jump-agenda bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-semibold py-2 px-3 rounded-lg text-xs flex items-center justify-center gap-1.5 transition-all">📅 Relance ultérieure</button>' +
      '</div>' +
      '<div class="text-right pt-0.5">' +
        '<button type="button" data-next-step="lost" class="sp-step-btn text-[11px] text-zinc-400 hover:text-rose-400 font-medium">✕ Classer sans suite</button>' +
      '</div>';
      break;

    case 'called':
      html = '<div class="grid grid-cols-2 gap-2">' +
        '<button type="button" data-next-step="won" data-stripe="1" class="sp-step-btn bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-3 rounded-lg text-xs shadow-sm flex items-center justify-center gap-1.5 transition-all">✓ Vente Gagnée & Stripe</button>' +
        '<button type="button" class="sp-jump-agenda bg-purple-900/60 hover:bg-purple-900 text-purple-200 border border-purple-700/50 font-semibold py-2 px-3 rounded-lg text-xs flex items-center justify-center gap-1.5 transition-all">📅 Relance ultérieure</button>' +
      '</div>' +
      '<div class="text-right pt-0.5">' +
        '<button type="button" data-next-step="lost" class="sp-step-btn text-[11px] text-zinc-400 hover:text-rose-400 font-medium">✕ Pas intéressé</button>' +
      '</div>';
      break;

    case 'callback_scheduled':
      html = '<div class="grid grid-cols-2 gap-2">' +
        '<button type="button" data-next-step="called" class="sp-step-btn bg-amber-600 hover:bg-amber-500 text-white font-bold py-2 px-3 rounded-lg text-xs shadow-sm flex items-center justify-center gap-1.5 transition-all">☎ Relance Faite ➔</button>' +
        '<button type="button" data-next-step="won" data-stripe="1" class="sp-step-btn bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-3 rounded-lg text-xs shadow-sm flex items-center justify-center gap-1.5 transition-all">✓ Vente Gagnée</button>' +
      '</div>' +
      '<div class="flex items-center justify-between pt-0.5 text-[11px]">' +
        '<button type="button" class="sp-jump-agenda text-purple-300 hover:underline">Décaler la relance ultérieure</button>' +
        '<button type="button" data-next-step="lost" class="sp-step-btn text-zinc-400 hover:text-rose-400 font-medium">✕ Sans suite</button>' +
      '</div>';
      break;

    case 'won':
      html = '<div class="bg-emerald-950/80 border border-emerald-500/40 rounded-lg p-2.5 text-center text-xs font-bold text-emerald-300">✓ Vente Gagnée · Dossier Clos</div>';
      break;

    case 'lost':
      html = '<div class="bg-zinc-800 rounded-lg p-2.5 text-center text-xs font-medium text-zinc-400">✕ Dossier Classé sans suite</div>';
      break;

    default:
      html = '';
  }
  box.innerHTML = html;
}

var CHANNEL_BADGES = { phone: '📞 Téléphone', email: '✉️ Email', contact_form: '📝 Formulaire' };

function isMobileNumber(phone) {
  var d = (phone || '').replace(/[^0-9+]/g, '');
  return /^(\\+33|0033|0)[67]/.test(d);
}

function formatPhone(phone) {
  var d = (phone || '').replace(/[^0-9]/g, '');
  if (d.length === 10) return d.replace(/(\\d{2})(?=\\d)/g, '$1 ').trim();
  return phone || '';
}

function setSpTab(name) {
  document.querySelectorAll('.sp-tab').forEach(function (t) {
    var on = t.dataset.spTab === name;
    t.classList.toggle('font-extrabold', on);
    t.classList.toggle('text-zinc-900', on);
    t.classList.toggle('shadow-[inset_0_-2px_0_#4f46e5]', on);
    t.classList.toggle('font-semibold', !on);
    t.classList.toggle('text-zinc-500', !on);
    t.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  document.querySelectorAll('[data-sp-pane]').forEach(function (p) {
    p.classList.toggle('hidden', p.dataset.spPane !== name);
  });
}

// Premier onglet selon le canal du lead : Appel (téléphone) ou Écrit (email / formulaire).
function arrangeSpTabs(lead, isAsyncMode) {
  var appelTab = document.querySelector('[data-sp-tab="appel"]');
  var ecritTab = document.querySelector('[data-sp-tab="ecrit"]');
  appelTab.style.order = isAsyncMode ? '2' : '1';
  ecritTab.style.order = isAsyncMode ? '1' : '2';
  appelTab.classList.toggle('hidden', !lead.phone && isAsyncMode);
  ['prospect', 'suivi', 'closing'].forEach(function (k, i) {
    document.querySelector('[data-sp-tab="' + k + '"]').style.order = String(3 + i);
  });
  setSpTab(isAsyncMode ? 'ecrit' : 'appel');
}

document.querySelectorAll('.sp-tab').forEach(function (t) {
  t.addEventListener('click', function () { setSpTab(t.dataset.spTab); });
});

// En-tête fixe : bouton principal selon le canal (appel ou email), badge du canal.
function renderPanelHeader(lead, isAsyncMode) {
  var dup = $('sp_duplicate');
  if (lead.duplicate_of) {
    dup.textContent = '⚠️ Même entreprise (SIREN) que : ' + lead.duplicate_of + ' — coordonnez-vous avant d\\'appeler.';
    dup.classList.remove('hidden');
  } else {
    dup.classList.add('hidden');
  }
  var ch = $('sp_channel_badge');
  if (lead.primary_channel && CHANNEL_BADGES[lead.primary_channel]) {
    ch.textContent = CHANNEL_BADGES[lead.primary_channel];
    ch.classList.remove('hidden');
  } else {
    ch.classList.add('hidden');
  }
  var btn = $('sp_head_call');
  var txt = $('sp_head_call_text');
  var phone = lead.phone || '';
  var useEmail = isAsyncMode && lead.email;
  btn.classList.remove('bg-emerald-600', 'hover:bg-emerald-500', 'bg-indigo-600', 'hover:bg-indigo-500', 'bg-zinc-700', 'pointer-events-none');
  if (useEmail) {
    btn.href = 'mailto:' + lead.email;
    btn.onclick = null;
    txt.textContent = lead.email;
    btn.classList.add('bg-indigo-600', 'hover:bg-indigo-500');
  } else if (phone) {
    btn.href = 'tel:' + phone.replace(/[^0-9+]/g, '');
    btn.onclick = async function (e) {
      e.preventDefault();
      await fetch('/api/leads/' + lead.id + '/lock', { method: 'POST' }).catch(function () {});
      window.location.href = 'tel:' + phone.replace(/[^0-9+]/g, '');
    };
    txt.textContent = formatPhone(phone);
    btn.classList.add('bg-emerald-600', 'hover:bg-emerald-500');
  } else {
    btn.href = '#';
    btn.onclick = function (e) { e.preventDefault(); };
    txt.textContent = 'Aucun contact direct';
    btn.classList.add('bg-zinc-700', 'pointer-events-none');
  }
}

// Accroche et objections (une seule ouverte à la fois), en texte brut.
function renderCallScript(lead) {
  var bc = lead.battlecard || {};
  $('sp_script').textContent = bc.callScript || bc.openingPitch || bc.cold_call_pitch || "Pas d'accroche disponible pour ce lead.";
  $('sp_copy_script').textContent = 'Copier';
  var box = $('sp_objections');
  box.innerHTML = '';
  var list = Array.isArray(bc.objections) ? bc.objections : [];
  if (!list.length) {
    var empty = document.createElement('p');
    empty.className = 'px-3 py-2.5 text-[13px] text-zinc-500';
    empty.textContent = 'Aucune objection préparée.';
    box.appendChild(empty);
    return;
  }
  list.forEach(function (o) {
    var d = document.createElement('details');
    d.className = 'group';
    var sum = document.createElement('summary');
    sum.className = 'cursor-pointer list-none flex justify-between items-center gap-2 px-3 min-h-11 py-2.5 text-sm font-semibold text-zinc-900';
    var q = document.createElement('span');
    q.textContent = '« ' + (o.objection || '') + ' »';
    var plus = document.createElement('span');
    plus.className = 'text-zinc-400 group-open:rotate-45 transition-transform';
    plus.setAttribute('aria-hidden', 'true');
    plus.textContent = '+';
    sum.appendChild(q);
    sum.appendChild(plus);
    var a = document.createElement('p');
    a.className = 'px-3 pb-3 text-[13px] leading-relaxed text-zinc-700';
    a.textContent = o.reply || o.response || '';
    d.appendChild(sum);
    d.appendChild(a);
    d.addEventListener('toggle', function () {
      if (d.open) box.querySelectorAll('details').forEach(function (x) { if (x !== d) x.open = false; });
    });
    box.appendChild(d);
  });
}

$('sp_copy_script').onclick = function () {
  var t = $('sp_script').textContent || '';
  if (navigator.clipboard) navigator.clipboard.writeText(t).catch(function () {});
  $('sp_copy_script').textContent = 'Copié ✓';
};

// Issue de l'appel ou réponse écrite : note horodatée + étape, en un clic.
var OUTCOMES = {
  interested: { label: 'Intéressé', status: 'called', icon: '✅' },
  callback: { label: 'À rappeler', status: 'callback_scheduled', icon: '📅' },
  voicemail: { label: 'Messagerie', status: 'callback_scheduled', icon: '📭' },
  lost: { label: 'Pas intéressé', status: 'lost', icon: '✕' }
};

function tomorrowAt10() {
  var d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  var pad = function (n) { return String(n).padStart(2, '0'); };
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T10:00';
}

document.addEventListener('click', async function (e) {
  var btn = e.target.closest('.sp-outcome');
  if (!btn || !activeLeadId) return;
  e.preventDefault();
  var kind = btn.dataset.outcome;
  var def = OUTCOMES[kind];
  var lead = LEADS_MAP[activeLeadId];
  if (!def || !lead) return;

  if (kind === 'callback') {
    // Choix de la date dans l'onglet Suivi, étape pré-remplie.
    setSpTab('suivi');
    var sel = $('sp_stage_select');
    if (sel && sel.querySelector('option[value="callback_scheduled"]')) sel.value = 'callback_scheduled';
    var note = $('sp_quick_note').value.trim();
    if (note) $('sp_call_notes').value = ($('sp_call_notes').value ? $('sp_call_notes').value + '\\n' : '') + note;
    $('sp_callback_at').focus();
    return;
  }
  if (kind === 'lost' && !confirm('Classer ' + lead.company_name + ' comme perdu ? La démo sera invalidée.')) return;

  var msg = $('sp_outcome_msg');
  msg.textContent = 'Enregistrement…';
  msg.className = 'text-xs text-indigo-700 font-semibold';
  var stamp = new Date().toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  var quick = $('sp_quick_note').value.trim();
  var entry = '[' + stamp + '] ' + def.icon + ' ' + def.label + (quick ? ' — ' + quick : '');
  var notes = (lead.call_notes ? lead.call_notes + '\\n' : '') + entry;

  try {
    if (kind === 'voicemail') {
      var r1 = await fetch('/api/leads/' + activeLeadId + '/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_scheduled_at: tomorrowAt10() })
      });
      if (!r1.ok) throw new Error('update');
    }
    var r = await fetch('/api/leads/' + activeLeadId + '/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: def.status, notes: notes, outcome: { label: def.label, note: quick } })
    });
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok) {
      msg.textContent = 'Erreur : ' + (j.message || j.error || r.status);
      msg.className = 'text-xs text-rose-700 font-semibold';
      return;
    }
    msg.textContent = '✔ ' + def.label + ' enregistré' + (kind === 'voicemail' ? ' · relance demain 10 h' : '');
    msg.className = 'text-xs text-emerald-700 font-semibold';
    setTimeout(function () { location.reload(); }, 700);
  } catch (err) {
    msg.textContent = 'Erreur réseau.';
    msg.className = 'text-xs text-rose-700 font-semibold';
  }
});

var TIMELINE_ICONS = { call_outcome: '☎', email_sent: '✉️', form_submitted: '📝', reply_received: '💬', note: '🗒', status_change: '↪' };

function timelineDate(iso) {
  var d = new Date(String(iso).replace(' ', 'T') + (String(iso).length <= 19 ? 'Z' : ''));
  return isNaN(d.getTime()) ? String(iso) : d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

// Fil chronologique : chaque email, message ou réponse se déplie pour relire son contenu exact.
function renderTimeline(list) {
  var box = $('sp_timeline');
  box.innerHTML = '';
  $('sp_timeline_count').textContent = list.length ? list.length + ' échange(s)' : '';
  if (!list.length) {
    var empty = document.createElement('li');
    empty.className = 'text-[13px] text-zinc-500';
    empty.textContent = 'Aucun échange enregistré pour l\\'instant.';
    box.appendChild(empty);
    return;
  }
  list.forEach(function (a) {
    var c = a.content || {};
    var li = document.createElement('li');
    var isReply = a.kind === 'reply_received';
    li.className = 'rounded-lg border px-3 py-2 ' + (isReply ? 'border-emerald-200 bg-emerald-50' : 'border-zinc-200 bg-white');
    var head = document.createElement('div');
    head.className = 'flex items-start gap-2';
    var ic = document.createElement('span');
    ic.setAttribute('aria-hidden', 'true');
    ic.textContent = TIMELINE_ICONS[a.kind] || '•';
    var main = document.createElement('div');
    main.className = 'min-w-0 flex-1';
    var title = document.createElement('p');
    title.className = 'text-[13px] font-semibold text-zinc-900';
    title.textContent = a.summary;
    var meta = document.createElement('p');
    meta.className = 'text-[11px] text-zinc-500';
    meta.textContent = timelineDate(a.created_at) + (a.user_name ? ' · ' + a.user_name : '');
    main.appendChild(title);
    main.appendChild(meta);
    var text = c.body || c.text || c.note || '';
    if (text) {
      var det = document.createElement('details');
      det.className = 'mt-1';
      var sum = document.createElement('summary');
      sum.className = 'cursor-pointer text-xs font-semibold text-indigo-700';
      sum.textContent = a.kind === 'email_sent' ? 'Voir l\\'email' : a.kind === 'form_submitted' ? 'Voir le message' : isReply ? 'Voir la réponse' : 'Voir la note';
      var pre = document.createElement('div');
      pre.className = 'mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-zinc-800';
      pre.textContent = (c.subject ? 'Objet : ' + c.subject + '\\n\\n' : '') + text;
      det.appendChild(sum);
      det.appendChild(pre);
      if (isReply) det.open = true;
      main.appendChild(det);
    }
    head.appendChild(ic);
    head.appendChild(main);
    li.appendChild(head);
    box.appendChild(li);
  });
}

async function loadTimeline(leadId) {
  $('sp_timeline').innerHTML = '<li class="text-[13px] text-zinc-500">Chargement…</li>';
  try {
    var r = await fetch('/api/leads/' + leadId + '/activities');
    var j = await r.json();
    if (activeLeadId !== leadId) return;
    renderTimeline(r.ok ? (j.activities || []) : []);
  } catch (e) {
    $('sp_timeline').innerHTML = '<li class="text-[13px] text-rose-700">Historique indisponible.</li>';
  }
}

$('sp_reply_toggle').onclick = function () {
  $('sp_reply_form').classList.toggle('hidden');
  $('sp_reply_msg').textContent = '';
  var lead = LEADS_MAP[activeLeadId];
  if (lead && lead.primary_channel && $('sp_reply_channel').querySelector('option[value="' + lead.primary_channel + '"]')) {
    $('sp_reply_channel').value = lead.primary_channel;
  }
};

$('sp_reply_save').onclick = async function () {
  if (!activeLeadId) return;
  var text = $('sp_reply_text').value.trim();
  var msg = $('sp_reply_msg');
  if (!text) { msg.textContent = 'Collez le texte de la réponse.'; msg.className = 'text-xs text-rose-700 font-semibold'; return; }
  var btn = this; btn.disabled = true;
  try {
    var r = await fetch('/api/leads/' + activeLeadId + '/activities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'reply_received', channel: $('sp_reply_channel').value, from: $('sp_reply_from').value, text: text })
    });
    var j = await r.json().catch(function () { return {}; });
    if (r.ok) {
      msg.textContent = '✔ Réponse ajoutée à l\\'historique';
      msg.className = 'text-xs text-emerald-700 font-semibold';
      $('sp_reply_text').value = '';
      $('sp_reply_from').value = '';
      loadTimeline(activeLeadId);
    } else {
      msg.textContent = j.message || 'Erreur';
      msg.className = 'text-xs text-rose-700 font-semibold';
    }
  } catch (e) {
    msg.textContent = 'Erreur réseau';
    msg.className = 'text-xs text-rose-700 font-semibold';
  }
  btn.disabled = false;
};

function openSidepanel(id) {
  var lead = LEADS_MAP[id];
  if (!lead) return;
  activeLeadId = id;

  $('sp_company_name').textContent = lead.company_name;
  $('sp_activity_city').textContent = (lead.activity || 'Activité non spécifiée') + ' · ' + (lead.city || 'Ville non spécifiée') + (lead.scanned_on ? ' · scanné le ' + lead.scanned_on : '');
  if ($('sp_rating_text')) $('sp_rating_text').textContent = (lead.google_rating || '–') + ' (' + (lead.google_reviews_count || 0) + ' avis)';

  var col = COLUMNS_MAP[lead.status] || { label: lead.status, badgeBg: 'bg-zinc-100 text-zinc-700' };
  $('sp_status_badge').textContent = col.label;
  $('sp_status_badge').className = 'px-2 py-0.5 rounded text-xs font-semibold ' + col.badgeBg;

  var oppDef = ALL_OPPORTUNITIES.find(function(o) { return o.id === (lead.opportunity_type || ${JSON.stringify(DEFAULT_OPPORTUNITY_ID)}); }) || {
    badge: '🎯 ' + (lead.opportunity_type || 'Opportunité'),
    channel: 'vocal_closer'
  };
  if ($('sp_opp_badge')) {
    $('sp_opp_badge').textContent = oppDef.badge;
    $('sp_opp_badge').className = 'px-2 py-0.5 rounded text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200';
  }

  if (lead.demo_viewed_count > 0) {
    if ($('sp_views_badge_text')) $('sp_views_badge_text').textContent = lead.demo_viewed_count + ' consultation(s) en direct';
    $('sp_views_badge').classList.remove('hidden');
    $('sp_views_badge').classList.add('inline-flex');
  } else {
    $('sp_views_badge').classList.add('hidden');
    $('sp_views_badge').classList.remove('inline-flex');
  }

  // Coordonnées
  $('sp_phone').value = lead.phone || '';
  $('sp_email').value = lead.email || '';
  updateContactLinks(lead);
  renderSidepanelStepActions(lead);

  // Comparatif Ancien vs Nouveau
  var oldLink = $('sp_old_site_url');
  var oldStatus = $('sp_old_site_status');
  var weaknessesList = $('sp_old_site_weaknesses');
  var auditSummary = $('sp_audit_summary');

  if (lead.website_url) {
    oldLink.href = lead.website_url;
    try {
      oldLink.textContent = new URL(lead.website_url).hostname;
    } catch (e) {
      oldLink.textContent = lead.website_url;
    }
    oldLink.classList.remove('hidden');
    oldStatus.innerHTML = '<span class="text-zinc-500 font-medium text-[11px]">Site en ligne existant</span>';
  } else {
    oldLink.classList.add('hidden');
    oldStatus.innerHTML = '<span class="text-amber-700 font-semibold text-[11px]">Aucun site web trouvé</span>';
  }

  weaknessesList.innerHTML = '';
  var allWeaknesses = [];
  if (lead.audit && Array.isArray(lead.audit.paid_ads_detected) && lead.audit.paid_ads_detected.length > 0) {
    allWeaknesses.push('💰 Budget pub actif (' + lead.audit.paid_ads_detected.join(', ') + ') : paie déjà pour du trafic !');
  }
  if (lead.audit && Array.isArray(lead.audit.obsolescence_signals)) {
    lead.audit.obsolescence_signals.forEach(function(s) {
      if (allWeaknesses.indexOf(s) === -1) allWeaknesses.push(s);
    });
  }
  if (lead.audit && Array.isArray(lead.audit.weaknesses)) {
    lead.audit.weaknesses.forEach(function(w) {
      if (allWeaknesses.indexOf(w) === -1) allWeaknesses.push(w);
    });
  }
  if (allWeaknesses.length > 0) {
    allWeaknesses.forEach(function(w) {
      var li = document.createElement('li');
      li.textContent = w;
      weaknessesList.appendChild(li);
    });
  } else {
    weaknessesList.innerHTML = '<li class="text-zinc-400 italic font-normal">Aucun point faible majeur listé</li>';
  }

  var briefText = (lead.battlecard && lead.battlecard.closerBrief)
    ? lead.battlecard.closerBrief
    : ((lead.audit && lead.audit.summary) ? lead.audit.summary : 'Aucun commentaire disponible.');
  auditSummary.textContent = briefText;

  var kpBadge = $('sp_key_people_badge');
  var keyPeopleArr = (lead.audit && Array.isArray(lead.audit.key_people)) ? lead.audit.key_people : [];
  if (kpBadge) {
    if (keyPeopleArr.length > 0) {
      kpBadge.textContent = 'Demander : ' + keyPeopleArr.join(' · ');
      kpBadge.classList.remove('hidden');
    } else {
      kpBadge.classList.add('hidden');
    }
  }

  var advList = $('sp_our_advantages');
  if (advList) {
    advList.innerHTML = '';
    var advItems = (lead.battlecard && Array.isArray(lead.battlecard.ourAdvantages) && lead.battlecard.ourAdvantages.length > 0)
      ? lead.battlecard.ourAdvantages
      : ((lead.audit && Array.isArray(lead.audit.recommendations) && lead.audit.recommendations.length > 0)
          ? lead.audit.recommendations
          : [
              "Barre d'appel d'urgence mobile collante en bas d'écran",
              'Mise en valeur immédiate des ' + (lead.google_reviews_count || '') + ' avis Google (' + (lead.google_rating || '5') + '★)',
              'Design moderne ultra-rapide avec reprise du vrai logo client'
            ]);
    advItems.slice(0, 3).forEach(function(a) {
      var li = document.createElement('li');
      li.className = 'flex gap-2';
      var tick = document.createElement('span');
      tick.className = 'text-emerald-600 font-extrabold';
      tick.textContent = '✓';
      var txt = document.createElement('span');
      txt.textContent = a;
      li.appendChild(tick);
      li.appendChild(txt);
      advList.appendChild(li);
    });
  }

  // Démo & Flyer
  $('sp_demo_url').href = lead.demo_url;
  renderDemoAccessStatus(lead);
  if (lead.flyer_url) {
    $('sp_link_flyer').href = lead.flyer_url;
    $('sp_link_flyer').classList.remove('hidden');
  } else {
    $('sp_link_flyer').classList.add('hidden');
  }

  // Agenda & Rappel
  $('sp_callback_at').value = lead.callback_scheduled_at ? lead.callback_scheduled_at.slice(0, 16) : '';
  if ($('sp_download_ics')) {
    if (lead.callback_scheduled_at) {
      $('sp_download_ics').href = '/api/leads/' + lead.id + '/calendar.ics';
      $('sp_download_ics').classList.remove('hidden');
    } else {
      $('sp_download_ics').classList.add('hidden');
    }
  }
  $('sp_call_notes').value = lead.call_notes || '';
  $('sp_contacts_msg').textContent = '';
  $('sp_agenda_msg').textContent = '';
  $('sp_stripe_result').textContent = '';

  var stageSelect = $('sp_stage_select');
  var saveAgendaBtn = $('sp_save_agenda');

  if (IS_ADMIN) {
    stageSelect.disabled = false;
    saveAgendaBtn.disabled = false;
    stageSelect.innerHTML = Object.keys(COLUMNS_MAP).map(function(k) {
      return '<option value="' + k + '" ' + (lead.status === k ? 'selected' : '') + '>' + COLUMNS_MAP[k].label + '</option>';
    }).join('');
  } else {
    // Closer : contrôle selon l'étape logique du lead
    if (lead.status === 'won' || lead.status === 'lost') {
      stageSelect.disabled = true;
      saveAgendaBtn.disabled = true;
      stageSelect.innerHTML = '<option value="' + lead.status + '" selected>' + COLUMNS_MAP[lead.status].label + ' (Clôturé)</option>';
      $('sp_agenda_msg').textContent = 'Dossier clôturé (seul l\\'administrateur peut modifier l\\'étape).';
      $('sp_agenda_msg').className = 'text-[11px] text-zinc-500 font-semibold';
    } else {
      stageSelect.disabled = false;
      saveAgendaBtn.disabled = false;
      var allowed = [];
      if (lead.status === 'demo_ready' || lead.status === 'hot_lead') {
        allowed = [lead.status, 'called', 'callback_scheduled', 'lost'];
      } else if (lead.status === 'called') {
        allowed = ['called', 'won', 'callback_scheduled', 'lost'];
      } else if (lead.status === 'callback_scheduled') {
        allowed = ['callback_scheduled', 'called', 'won', 'lost'];
      } else {
        allowed = [lead.status];
      }
      stageSelect.innerHTML = allowed.map(function(k) {
        return '<option value="' + k + '" ' + (lead.status === k ? 'selected' : '') + '>' + COLUMNS_MAP[k].label + '</option>';
      }).join('');
    }
  }

  // Composer d'email (toutes opportunités) + Battlecard vocale uniquement pour le canal téléphonique
  var hasColdEmail = lead.battlecard && (lead.battlecard.coldEmail || lead.battlecard.subject);
  var coldEmailData = hasColdEmail ? (lead.battlecard.coldEmail || { subject: lead.battlecard.subject, body: lead.battlecard.body }) : null;
  // Canal principal du lead (phase 1) ; pour un lead plus ancien, ancienne règle (opportunité ou brouillon d'email présent).
  var isAsyncMode = lead.primary_channel ? lead.primary_channel !== 'phone' : (oppDef.channel === 'async_email' || hasColdEmail);
  setupContactForm(lead);

  setupEmailComposer(lead, oppDef, coldEmailData);
  renderCallScript(lead);
  renderPanelHeader(lead, isAsyncMode);
  $('sp_quick_note').value = '';
  $('sp_outcome_msg').textContent = "Un clic enregistre l'issue, la note et met à jour l'étape.";
  $('sp_outcome_msg').className = 'text-xs text-zinc-600';
  arrangeSpTabs(lead, isAsyncMode);
  var genList = $('sp_generated_by');
  genList.innerHTML = '';
  (lead.generated_by && lead.generated_by.length ? lead.generated_by : ['Inconnu (lead antérieur au suivi de provenance)']).forEach(function (line) {
    var li = document.createElement('li');
    li.textContent = line;
    if (line.indexOf('repli') !== -1) li.className = 'text-amber-800 font-semibold';
    genList.appendChild(li);
  });
  $('sp_reply_form').classList.add('hidden');
  loadTimeline(id);

  // Ouverture visuelle fluide
  $('sp_backdrop').classList.remove('hidden');
  setTimeout(function() {
    $('sp_backdrop').classList.remove('opacity-0');
    $('sp_backdrop').classList.add('opacity-100');
    $('sidepanel').classList.remove('translate-x-full');
  }, 10);
}

function closeSidepanel() {
  $('sp_backdrop').classList.remove('opacity-100');
  $('sp_backdrop').classList.add('opacity-0');
  $('sidepanel').classList.add('translate-x-full');
  setTimeout(function() {
    $('sp_backdrop').classList.add('hidden');
    activeLeadId = null;
  }, 300);
}

// Clics pour ouvrir / fermer le panneau
var isDraggingCard = false;

document.addEventListener('click', function(e) {
  if (isDraggingCard) return;

  // Si on clique sur le bouton fermer ou le backdrop sombre
  if (e.target.closest('#sp_close') || e.target === $('sp_backdrop')) {
    closeSidepanel();
    return;
  }

  // Si le clic a lieu à l'intérieur du panneau ouvert, ne pas réagir
  if (e.target.closest('#sidepanel')) return;

  // Si l'utilisateur clique directement sur un lien externe de démo (target=_blank)
  if (e.target.closest('a[target="_blank"]')) return;

  // Clic sur n'importe quel endroit de la fiche (carte)
  var card = e.target.closest('article.lead-card');
  if (card) {
    var leadId = card.getAttribute('data-lead');
    if (leadId) openSidepanel(leadId);
  }
});

// Actions d'étape rapide depuis le panneau latéral (Process Closer & Admin)
document.addEventListener('click', async function (e) {
  var btn = e.target.closest('.sp-step-btn');
  if (!btn || !activeLeadId) return;
  e.preventDefault();
  var nextStep = btn.dataset.nextStep;
  var sendStripe = btn.dataset.stripe === '1';
  if (!nextStep) return;

  btn.disabled = true;
  var origText = btn.innerHTML;
  btn.textContent = 'Enregistrement…';

  try {
    var r = await fetch('/api/leads/' + activeLeadId + '/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStep, sendStripe: sendStripe })
    });
    var j = await r.json();
    if (r.ok) {
      if (j.paymentUrl) {
        var phone = LEADS_MAP[activeLeadId] ? LEADS_MAP[activeLeadId].phone : '';
        var waMsg = 'Voici votre lien de paiement sécurisé Stripe : ' + j.paymentUrl;
        var waUrl = 'https://wa.me/' + toWaNumber(phone) + '?text=' + encodeURIComponent(waMsg);
        window.open(waUrl, '_blank');
      }
      location.reload();
    } else {
      alert('Erreur : ' + (j.message || j.error || r.status));
      btn.disabled = false;
      btn.innerHTML = origText;
    }
  } catch (err) {
    alert('Erreur réseau');
    btn.disabled = false;
    btn.innerHTML = origText;
  }
});

document.addEventListener('click', function (e) {
  var btn = e.target.closest('.sp-jump-agenda');
  if (!btn) return;
  e.preventDefault();
  setSpTab('suivi');
  var input = $('sp_callback_at');
  if (input) {
    input.focus();
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
});

${renderClientDemoSlotHelperScript()}

function renderDemoAccessStatus(lead) {
  var badge = $('sp_demo_expiry_badge');
  var btnRevoke = $('sp_btn_revoke_demo');
  var btnExtend = $('sp_btn_extend_demo');
  var btnDemo = $('sp_demo_url');
  if (!badge) return;

  var state = computeDemoAccessState(lead);

  badge.textContent = state.sidepanelBadgeText;
  badge.className = state.sidepanelBadgeClass;

  if (btnDemo) {
    if (state.canOpenDemo) btnDemo.classList.remove('hidden');
    else btnDemo.classList.add('hidden');
  }
  if (btnRevoke) {
    if (state.canRevoke) btnRevoke.classList.remove('hidden');
    else btnRevoke.classList.add('hidden');
  }
  if (btnExtend) {
    btnExtend.textContent = state.extendButtonText;
  }
  var headDemo = $('sp_head_demo');
  if (headDemo) {
    headDemo.href = lead.demo_url;
    headDemo.classList.toggle('hidden', !state.canOpenDemo);
  }
  var headInfo = $('sp_head_demo_info');
  if (headInfo) {
    headInfo.textContent = 'Démo vue ' + (lead.demo_viewed_count || 0) + ' fois · ' + state.sidepanelBadgeText;
  }

  // Synchronise tous les emplacements de démo des cartes (Kanban, Liste, Agenda) en respectant leur variante
  document.querySelectorAll('[data-card-demo-slot="' + lead.id + '"]').forEach(function (slot) {
    var variant = slot.getAttribute('data-demo-variant') || 'compact';
    slot.innerHTML = renderClientCardDemoSlotInner(lead.id, state, variant);
  });
}

if ($('sp_btn_revoke_demo')) {
  $('sp_btn_revoke_demo').onclick = async function () {
    if (!activeLeadId) return;
    var r = await fetch('/api/leads/' + activeLeadId + '/demo-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'revoke' })
    });
    if (r.ok) {
      var j = await r.json();
      LEADS_MAP[activeLeadId].demo_revoked = j.demo_revoked;
      LEADS_MAP[activeLeadId].demo_expires_at = j.demo_expires_at || '';
      renderDemoAccessStatus(LEADS_MAP[activeLeadId]);
    }
  };
}

if ($('sp_btn_extend_demo')) {
  $('sp_btn_extend_demo').onclick = async function () {
    if (!activeLeadId) return;
    var r = await fetch('/api/leads/' + activeLeadId + '/demo-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'extend', days: 5 })
    });
    if (r.ok) {
      var j = await r.json();
      LEADS_MAP[activeLeadId].demo_revoked = j.demo_revoked;
      LEADS_MAP[activeLeadId].demo_expires_at = j.demo_expires_at || '';
      renderDemoAccessStatus(LEADS_MAP[activeLeadId]);
    }
  };
}

if ($('sp_close')) $('sp_close').onclick = closeSidepanel;
if ($('sp_backdrop')) $('sp_backdrop').onclick = closeSidepanel;
document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeSidepanel(); });

// Sauvegarde des coordonnées (Téléphone & Email)
if ($('sp_save_contacts')) {
  $('sp_save_contacts').onclick = async function () {
    if (!activeLeadId) return;
    var msg = $('sp_contacts_msg');
    msg.textContent = 'Enregistrement…';
    msg.className = 'text-[11px] text-blue-600 font-bold';
    var phone = $('sp_phone').value.trim();
    var email = $('sp_email').value.trim();

    try {
      var r = await fetch('/api/leads/' + activeLeadId + '/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone, email: email })
      });
      if (r.ok) {
        LEADS_MAP[activeLeadId].phone = phone;
        LEADS_MAP[activeLeadId].email = email;
        updateContactLinks(LEADS_MAP[activeLeadId]);
        msg.textContent = '✔ Coordonnées enregistrées !';
        msg.className = 'text-[11px] text-green-600 font-bold';
      } else {
        msg.textContent = 'Erreur lors de l\\'enregistrement.';
        msg.className = 'text-[11px] text-red-600 font-bold';
      }
    } catch (e) {
      msg.textContent = 'Erreur réseau.';
      msg.className = 'text-[11px] text-red-600 font-bold';
    }
  };
}

// Sauvegarde Agenda de rappel & Notes
if ($('sp_save_agenda')) {
  $('sp_save_agenda').onclick = async function () {
    if (!activeLeadId) return;
    var msg = $('sp_agenda_msg');
    msg.textContent = 'Enregistrement…';
    msg.className = 'text-[11px] text-purple-600 font-bold';
    var callback = $('sp_callback_at').value;
    var stage = $('sp_stage_select').value;
    var notes = $('sp_call_notes').value;

    try {
      var r = await fetch('/api/leads/' + activeLeadId + '/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callback_scheduled_at: callback,
          status: stage,
          call_notes: notes
        })
      });
      if (r.ok) {
        var resData = await r.json().catch(function() { return {}; });
        if (resData.google_calendar && resData.google_calendar.ok) {
          msg.textContent = '✔ Relance enregistrée dans l\\'Agenda & Google Agenda !';
        } else {
          msg.textContent = '✔ Relance enregistrée dans l\\'Agenda Interne !';
        }
        if (callback && $('sp_download_ics')) {
          $('sp_download_ics').href = '/api/leads/' + activeLeadId + '/calendar.ics';
          $('sp_download_ics').classList.remove('hidden');
        }
        msg.className = 'text-[11px] text-green-600 font-bold';
        setTimeout(function () { location.reload(); }, 800);
      } else {
        msg.textContent = 'Erreur lors de la sauvegarde.';
        msg.className = 'text-[11px] text-red-600 font-bold';
      }
    } catch (e) {
      msg.textContent = 'Erreur réseau.';
      msg.className = 'text-[11px] text-red-600 font-bold';
    }
  };
}

// Bouton 1-clic direct Google Agenda (Template URL)
if ($('sp_open_gcalendar')) {
  $('sp_open_gcalendar').onclick = function () {
    if (!activeLeadId || !LEADS_MAP[activeLeadId]) return;
    var lead = LEADS_MAP[activeLeadId];
    var val = $('sp_callback_at').value;
    if (!val) {
      alert("Veuillez d'abord sélectionner une date et une heure de relance ci-dessus.");
      $('sp_callback_at').focus();
      return;
    }
    var startD = new Date(val);
    if (isNaN(startD.getTime())) {
      alert("Format de date invalide.");
      return;
    }
    var endD = new Date(startD.getTime() + 30 * 60 * 1000);
    function fmt(d) {
      return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    }
    var dates = fmt(startD) + '/' + fmt(endD);
    var summary = '📞 Relance : ' + lead.company_name + (lead.activity ? ' (' + lead.activity + ')' : '');
    var notes = $('sp_call_notes').value;
    var details = [
      '🏢 Entreprise : ' + lead.company_name,
      '📞 Téléphone direct : ' + (lead.phone || 'Non renseigné'),
      '📍 Ville : ' + (lead.city || ''),
      '',
      '🌐 Démo créée : ' + window.location.origin + '/demos/' + lead.id,
      '📋 Notes : ' + (notes || 'Aucune note'),
    ].join('\\n');
    var loc = lead.phone ? ('Tél: ' + lead.phone) : (lead.city || '');

    var u = 'https://calendar.google.com/calendar/render?action=TEMPLATE'
      + '&text=' + encodeURIComponent(summary)
      + '&dates=' + dates
      + '&details=' + encodeURIComponent(details)
      + '&location=' + encodeURIComponent(loc);

    window.open(u, '_blank');
  };
}

// Vérification de la connexion Google Agenda
async function initGoogleStatus() {
  var dot = $('google_dot');
  var text = $('google_text');
  var btn = $('google_btn');
  var spSync = $('sp_google_sync_status');

  try {
    var res = await fetch('/api/closer/google-status');
    if (!res.ok) return;
    var data = await res.json();
    if (data.connected) {
      if (dot) dot.className = 'w-2 h-2 rounded-full bg-emerald-500';
      if (text) text.textContent = 'Google Agenda : Connecté (' + (data.email || 'Actif') + ')';
      if (spSync) spSync.innerHTML = '<span class="text-emerald-700 font-semibold">Lié (' + (data.email || 'actif') + ')</span>';
      if (btn) {
        btn.textContent = 'Déconnecter';
        btn.href = '#';
        btn.onclick = async function (e) {
          e.preventDefault();
          if (confirm('Voulez-vous déconnecter Google Agenda ?')) {
            await fetch('/api/closer/google-disconnect', { method: 'POST' });
            location.reload();
          }
        };
      }
    } else {
      if (dot) dot.className = 'w-2 h-2 rounded-full bg-amber-500';
      if (text) text.textContent = 'Google Agenda : Non lié';
      if (spSync) spSync.innerHTML = '<span class="text-zinc-500">Non lié · <a href="/auth/google" class="text-purple-700 underline font-semibold">Lier Google</a></span>';
      if (btn) {
        btn.textContent = 'Lier';
        btn.href = '/auth/google';
      }
    }
  } catch (e) {}

  // Message flash de confirmation si retour OAuth
  var params = new URLSearchParams(window.location.search);
  if (params.get('google') === 'connected') {
    alert('✔ Votre compte Google Agenda a été relié avec succès ! Vos prochaines relances y seront ajoutées automatiquement.');
    // Nettoie l'URL
    var cleanUrl = window.location.pathname + (params.get('view') ? '?view=' + params.get('view') : '');
    window.history.replaceState({}, document.title, cleanUrl);
  } else if (params.get('google_error')) {
    alert('⚠ Erreur lors de la liaison Google Agenda : ' + params.get('google_error'));
  }
}
initGoogleStatus();

// Changement de palier tarifaire Stripe (3 Offres)
if ($('sp_offer_tier')) {
  $('sp_offer_tier').onchange = function () {
    var sel = $('sp_offer_tier');
    var opt = sel.options[sel.selectedIndex];
    var badge = $('sp_stripe_price_badge');
    var wrap = $('sp_custom_amount_wrap');
    if (badge && opt) badge.textContent = opt.getAttribute('data-badge') || '490 € HT';
    if (wrap) {
      if (sel.value === 'custom') wrap.classList.remove('hidden');
      else wrap.classList.add('hidden');
    }
  };
}

// Génération lien Stripe depuis le sidepanel
if ($('sp_btn_stripe')) {
  $('sp_btn_stripe').onclick = async function () {
    if (!activeLeadId) return;
    var out = $('sp_stripe_result');
    out.textContent = 'Génération en cours…';
    out.className = 'text-xs text-violet-600 font-bold';

    var offerTier = $('sp_offer_tier') ? $('sp_offer_tier').value : 'static';
    var customAmountEur = (offerTier === 'custom' && $('sp_custom_amount')) ? Number($('sp_custom_amount').value) : undefined;

    try {
      var r = await fetch('/api/leads/' + activeLeadId + '/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'won',
          sendStripe: true,
          offerTier: offerTier,
          customAmountEur: customAmountEur
        })
      });
      var j = await r.json();
      if (r.ok && j.paymentUrl) {
        var waMsg = 'Voici le lien sécurisé pour valider votre nouveau site : ' + j.paymentUrl;
        var waUrl = 'https://wa.me/' + toWaNumber(LEADS_MAP[activeLeadId].phone) + '?text=' + encodeURIComponent(waMsg);
        out.innerHTML = '<a href="' + waUrl + '" target="_blank" rel="noopener" class="underline font-semibold text-violet-800">Envoyer le lien WhatsApp</a>';
      } else {
        out.textContent = 'Erreur : ' + (j.message || 'Échec');
        out.className = 'text-xs text-red-600';
      }
    } catch (e) {
      out.textContent = 'Erreur réseau';
      out.className = 'text-xs text-red-600';
    }
  };
}

// ========================================================
// 2. PROCESS CLOSER GUIDÉ (Séquence logique de vie d'un lead)
// ========================================================
document.addEventListener('click', async function (e) {
  var btn = e.target.closest('.step-btn');
  if (!btn) return;
  e.preventDefault();
  var leadId = btn.dataset.id;
  var nextStep = btn.dataset.nextStep;
  var sendStripe = btn.dataset.stripe === '1';
  if (!leadId || !nextStep) return;

  btn.disabled = true;
  var origText = btn.innerHTML;
  btn.textContent = 'En cours…';

  try {
    var r = await fetch('/api/leads/' + leadId + '/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStep, sendStripe: sendStripe })
    });
    var j = await r.json();
    if (r.ok) {
      if (j.paymentUrl) {
        var phone = LEADS_MAP[leadId] ? LEADS_MAP[leadId].phone : '';
        var waMsg = 'Voici votre lien de paiement sécurisé Stripe : ' + j.paymentUrl;
        var waUrl = 'https://wa.me/' + toWaNumber(phone) + '?text=' + encodeURIComponent(waMsg);
        window.open(waUrl, '_blank');
      }
      location.reload();
    } else {
      alert('Erreur : ' + (j.message || j.error || r.status));
      btn.disabled = false;
      btn.innerHTML = origText;
    }
  } catch (err) {
    alert('Erreur réseau');
    btn.disabled = false;
    btn.innerHTML = origText;
  }
});

// ========================================================
// 3. DRAG & DROP KANBAN (Réservé exclusivement à l'Admin)
// ========================================================
var draggedCard = null;
var draggedLeadId = null;

function initDragAndDrop() {
  if (!IS_ADMIN) return; // Seul l'administrateur peut basculer librement les leads entre colonnes
  document.querySelectorAll('article.lead-card').forEach(function (card) {
    card.addEventListener('dragstart', function (e) {
      isDraggingCard = true;
      draggedCard = card;
      draggedLeadId = card.getAttribute('data-lead');
      e.dataTransfer.setData('text/plain', draggedLeadId);
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(function () { card.classList.add('opacity-40', 'scale-[0.98]'); }, 0);
    });

    card.addEventListener('dragend', function () {
      if (draggedCard) {
        draggedCard.classList.remove('opacity-40', 'scale-[0.98]');
        draggedCard = null;
        draggedLeadId = null;
      }
      setTimeout(function () { isDraggingCard = false; }, 100);
      document.querySelectorAll('.kanban-col').forEach(function (col) {
        col.classList.remove('ring-2', 'ring-indigo-500', 'bg-indigo-50/60');
      });
    });
  });

  document.querySelectorAll('.kanban-col').forEach(function (col) {
    col.addEventListener('dragover', function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });

    col.addEventListener('dragenter', function (e) {
      e.preventDefault();
      col.classList.add('ring-2', 'ring-indigo-500', 'bg-indigo-50/60');
    });

    col.addEventListener('dragleave', function (e) {
      if (!col.contains(e.relatedTarget)) {
        col.classList.remove('ring-2', 'ring-indigo-500', 'bg-indigo-50/60');
      }
    });

    col.addEventListener('drop', async function (e) {
      e.preventDefault();
      col.classList.remove('ring-2', 'ring-indigo-500', 'bg-indigo-50/60');

      var targetStatus = col.getAttribute('data-status');
      var leadId = e.dataTransfer.getData('text/plain') || draggedLeadId;
      if (!leadId || !targetStatus) return;

      var card = document.querySelector('article.lead-card[data-lead="' + leadId + '"]');
      if (!card) return;

      var currentStatus = card.getAttribute('data-status');
      if (currentStatus === targetStatus) return;

      var targetContainer = col.querySelector('.kanban-cards');
      if (!targetContainer) return;

      // 1. Déplacement immédiat dans le DOM (optimiste)
      targetContainer.prepend(card);
      card.setAttribute('data-status', targetStatus);

      // Met à jour la liste déroulante interne de la carte
      var sel = card.querySelector('select[name="status"]');
      if (sel) sel.value = targetStatus;

      // Met à jour les compteurs visuels des colonnes
      updateKanbanCounts();

      // 2. Persistance serveur en tâche de fond
      try {
        var r = await fetch('/api/leads/' + leadId + '/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: targetStatus })
        });
        if (!r.ok) {
          var j = await r.json().catch(function () { return {}; });
          alert('Erreur lors du déplacement : ' + (j.error || r.status));
          location.reload();
        }
      } catch (err) {
        alert('Erreur réseau');
        location.reload();
      }
    });
  });
}

function updateKanbanCounts() {
  document.querySelectorAll('.kanban-col').forEach(function (col) {
    var count = col.querySelectorAll('article.lead-card').length;
    var badge = col.querySelector('.col-badge');
    if (badge) badge.textContent = count;
    var ph = col.querySelector('.empty-placeholder');
    if (ph) {
      if (count === 0) ph.classList.remove('hidden');
      else ph.classList.add('hidden');
    }
  });
}

initDragAndDrop();

// ========================================================
// 2. CHANGEMENT INSTANTANÉ VIA MENU DÉROULANT (Mobile/Clic)
// ========================================================
document.querySelectorAll('.quick-stage-select').forEach(function (select) {
  select.addEventListener('change', async function () {
    var form = select.closest('form');
    var leadId = form.dataset.id;
    var newStatus = select.value;
    select.disabled = true;

    try {
      var r = await fetch('/api/leads/' + leadId + '/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (r.ok) {
        location.reload();
      } else {
        alert('Erreur de mise à jour');
        select.disabled = false;
      }
    } catch (e) {
      alert('Erreur réseau');
      select.disabled = false;
    }
  });
});

// ========================================================
// 3. ACTIONS BOUTON APPEL (Lock 15 min anti-doublon)
// ========================================================
document.querySelectorAll('a[data-lock]').forEach(function (a) {
  a.addEventListener('click', async function (e) {
    e.preventDefault();
    var r = await fetch('/api/leads/' + a.dataset.lock + '/lock', { method: 'POST' });
    if (r.status === 409) { var j = await r.json(); alert('Déjà en cours d\\'appel par ' + (j.locked_by || 'un collègue')); return; }
    window.location.href = a.getAttribute('href');
  });
});

// ========================================================
// 4. VALIDATION FORMULAIRE (Notes / Stripe)
// ========================================================
document.querySelectorAll('.status-form').forEach(function (form) {
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    var btn = e.submitter, out = form.querySelector('.result');
    var data = new FormData(form);
    out.textContent = 'Enregistrement…';
    out.className = 'result text-[11px] text-blue-600 font-semibold';
    var r = await fetch('/api/leads/' + form.dataset.id + '/status', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: data.get('status'), notes: data.get('notes'), sendStripe: btn && btn.dataset.stripe === '1' })
    });
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok) { out.className = 'result text-[11px] text-red-600'; out.textContent = 'Erreur : ' + (j.message || j.error || r.status); return; }
    out.className = 'result text-[11px] text-emerald-700 font-semibold';
    out.textContent = 'Enregistré';
    if (j.paymentUrl) {
      var msg = 'Voici votre lien de paiement sécurisé : ' + j.paymentUrl;
      var wa = 'https://wa.me/' + form.dataset.phone + '?text=' + encodeURIComponent(msg);
      out.innerHTML = 'Enregistré · <a class="underline font-semibold text-violet-700" target="_blank" rel="noopener" href="' + wa + '">Envoyer le lien Stripe via WhatsApp</a>';
    } else {
      setTimeout(function () { location.reload(); }, 600);
    }
  });
});

// ========================================================
// 5. ACTIONS AGENDA & REPROGRAMMATION RAPIDE
// ========================================================
document.querySelectorAll('.btn-open-panel').forEach(function(btn) {
  btn.addEventListener('click', function(e) {
    e.stopPropagation();
    var id = btn.getAttribute('data-lead');
    if (id) openSidepanel(id);
  });
});

document.querySelectorAll('.btn-reschedule').forEach(function(btn) {
  btn.addEventListener('click', async function(e) {
    e.stopPropagation();
    var id = btn.getAttribute('data-id');
    var addHours = parseInt(btn.getAttribute('data-hours') || '1', 10);
    if (!id) return;

    var lead = LEADS_MAP[id];
    var currentBase = (lead && lead.callback_scheduled_at) ? new Date(lead.callback_scheduled_at) : new Date();
    if (isNaN(currentBase.getTime()) || currentBase.getTime() < Date.now()) {
      currentBase = new Date();
    }
    var newDate = new Date(currentBase.getTime() + addHours * 3600 * 1000);
    var isoStr = newDate.toISOString();

    btn.textContent = '…';
    btn.disabled = true;

    try {
      var r = await fetch('/api/leads/' + id + '/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_scheduled_at: isoStr })
      });
      if (r.ok) {
        location.reload();
      } else {
        alert('Erreur lors du décalage');
        btn.disabled = false;
      }
    } catch (err) {
      alert('Erreur réseau');
      btn.disabled = false;
    }
  });
});

// 6. Composer d'email : templating + relecture humaine (aucun envoi automatique)
function renderTpl(tpl, vars) {
  return String(tpl || '').replace(/\\{\\{\\s*([a-z0-9_]+)\\s*(?:\\|([^}]*))?\\}\\}/gi, function (_m, key, fallback) {
    var v = vars[key];
    return (v !== undefined && v !== '') ? v : (fallback || '');
  });
}

var composerLead = null;
var composerAiEmail = null;

function refreshMailto() {
  var to = $('sp_email_to').value.trim();
  $('sp_open_mailto').href = 'mailto:' + encodeURIComponent(to).replace(/%40/g, '@')
    + '?subject=' + encodeURIComponent($('sp_email_subject').value)
    + '&body=' + encodeURIComponent($('sp_email_body').value);
  var warn = $('sp_tpl_warning');
  var missing = ($('sp_email_subject').value + $('sp_email_body').value).match(/\\{\\{[^}]+\\}\\}/g);
  var empty = /\\n-\\s*$|\\n\\s*\\n\\s*\\n\\s*\\n/.test($('sp_email_body').value);
  if (missing) { warn.textContent = '⚠ Variables non remplacées : ' + missing.join(', '); warn.classList.remove('hidden'); }
  else if (!to) { warn.textContent = '⚠ Aucun destinataire renseigné.'; warn.classList.remove('hidden'); }
  else if (empty) { warn.textContent = '⚠ Certaines données semblent manquantes (liste vide ?). Relisez avant envoi.'; warn.classList.remove('hidden'); }
  else warn.classList.add('hidden');
}

function applyTemplate(tplId) {
  if (!composerLead) return;
  if (tplId === '__ai__' && composerAiEmail) {
    $('sp_email_subject').value = composerAiEmail.subject || '';
    $('sp_email_body').value = composerAiEmail.body || '';
  } else {
    var tpl = EMAIL_TEMPLATES.find(function (t) { return t.id === tplId; });
    if (!tpl) return;
    var vars = composerLead.tpl_vars || {};
    $('sp_email_subject').value = renderTpl(tpl.subject, vars);
    $('sp_email_body').value = renderTpl(tpl.body, vars);
  }
  refreshMailto();
}

function setupContactForm(lead) {
  var block = $('sp_form_block');
  if (!block) return;
  if (!lead.contact_form_url) { block.classList.add('hidden'); return; }
  block.classList.remove('hidden');
  var cap = $('sp_form_captcha');
  if (lead.contact_form_captcha) {
    cap.textContent = '⚠️ Protégé par ' + lead.contact_form_captcha + ' : validation manuelle obligatoire.';
    cap.classList.remove('hidden');
  } else cap.classList.add('hidden');
  $('sp_form_feedback').textContent = '';
}

$('sp_open_form').onclick = function () {
  var lead = LEADS_MAP[activeLeadId];
  if (!lead || !lead.contact_form_url) return;
  var body = $('sp_email_body') ? $('sp_email_body').value : '';
  if (body && navigator.clipboard) navigator.clipboard.writeText(body).catch(function () {});
  window.open(lead.contact_form_url, '_blank', 'noopener');
  $('sp_form_feedback').textContent = body ? '✔ Message copié : collez-le dans le formulaire.' : 'Formulaire ouvert (aucun message à copier).';
};

$('sp_mark_form_submitted').onclick = async function () {
  var lead = LEADS_MAP[activeLeadId];
  if (!lead || !lead.contact_form_url) return;
  if (!confirm('Confirmez-vous avoir soumis le message via le formulaire de ' + lead.company_name + ' ?')) return;
  var btn = this; btn.disabled = true;
  try {
    var r = await fetch('/api/leads/' + activeLeadId + '/form-submitted', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ form_url: lead.contact_form_url, body: $('sp_email_body') ? $('sp_email_body').value : '' })
    });
    var j = await r.json();
    if (r.ok) {
      $('sp_form_feedback').textContent = '✔ Soumission ajoutée à l\\'historique';
      loadTimeline(activeLeadId);
      lead.call_notes = j.call_notes;
      if ($('sp_call_notes')) $('sp_call_notes').value = j.call_notes;
    } else alert(j.message || 'Erreur');
  } catch (err) { alert('Erreur réseau'); }
  btn.disabled = false;
};

function setupEmailComposer(lead, oppDef, aiEmail) {
  composerLead = lead;
  composerAiEmail = aiEmail && aiEmail.body ? aiEmail : null;
  var sel = $('sp_tpl_select');
  sel.innerHTML = '';
  if (composerAiEmail) {
    var o = document.createElement('option');
    o.value = '__ai__'; o.textContent = '✨ Brouillon généré par l\\'IA';
    sel.appendChild(o);
  }
  var specific = EMAIL_TEMPLATES.filter(function (t) { return t.opportunities.indexOf(oppDef.id) !== -1; });
  var generic = EMAIL_TEMPLATES.filter(function (t) { return t.opportunities.indexOf('*') !== -1; });
  specific.concat(generic).forEach(function (t) {
    var opt = document.createElement('option');
    opt.value = t.id; opt.textContent = t.label;
    sel.appendChild(opt);
  });
  $('sp_email_to').value = lead.email || '';
  if (sel.options.length) applyTemplate(sel.options[0].value);
}

$('sp_tpl_select').addEventListener('change', function (e) { applyTemplate(e.target.value); });
['sp_email_to', 'sp_email_subject', 'sp_email_body'].forEach(function (id) {
  $(id).addEventListener('input', refreshMailto);
});

function copyFeedback(msg) {
  $('sp_copy_feedback').textContent = msg;
  setTimeout(function () { $('sp_copy_feedback').textContent = ''; }, 2500);
}
$('sp_copy_subject').onclick = function () {
  navigator.clipboard.writeText($('sp_email_subject').value); copyFeedback('✔ Objet copié !');
};
$('sp_copy_body').onclick = function () {
  navigator.clipboard.writeText($('sp_email_body').value); copyFeedback('✔ Corps copié !');
};

$('sp_mark_sent').onclick = async function () {
  if (!activeLeadId) return;
  var to = $('sp_email_to').value.trim();
  var subject = $('sp_email_subject').value.trim();
  if (!to || !subject) { copyFeedback(''); alert('Renseignez un destinataire et un objet avant de marquer comme envoyé.'); return; }
  if (!confirm('Confirmez-vous avoir envoyé cet email à ' + to + ' ?')) return;
  var btn = this; btn.disabled = true;
  try {
    var r = await fetch('/api/leads/' + activeLeadId + '/email-sent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: to, subject: subject, body: $('sp_email_body').value, template_id: $('sp_tpl_select').value })
    });
    var j = await r.json();
    if (r.ok) {
      copyFeedback('✔ Email ajouté à l\\'historique');
      loadTimeline(activeLeadId);
      if (LEADS_MAP[activeLeadId]) { LEADS_MAP[activeLeadId].call_notes = j.call_notes; LEADS_MAP[activeLeadId].email = to; }
      if ($('sp_call_notes')) $('sp_call_notes').value = j.call_notes;
      if ($('sp_email')) $('sp_email').value = to;
    } else alert(j.message || 'Erreur');
  } catch (err) { alert('Erreur réseau'); }
  btn.disabled = false;
};
</script>`;

  return layout("Backlog & Pipeline", body, navbar(user.name, user.role, "closer"));
}
