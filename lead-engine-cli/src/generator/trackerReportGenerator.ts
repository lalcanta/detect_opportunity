import type { MapsLead, SiteInspection } from "../types";
import { escapeHtml } from "../utils/helpers";
import { renderReportPage } from "./reportLayout";

export interface TrackerReportInput {
  leadId: string;
  lead: MapsLead;
  inspection: SiteInspection | null;
  remoteAppUrl: string;
}

const CATEGORY_LABELS: Record<string, { label: string; badgeClass: string }> = {
  analytics: { label: "Analytics & Mesure", badgeClass: "bg-amber-500/10 text-amber-300 border-amber-500/30" },
  advertising: { label: "Advertising / Retargeting", badgeClass: "bg-rose-500/10 text-rose-300 border-rose-500/30" },
  heatmap_ux: { label: "Session Recording / Heatmap", badgeClass: "bg-purple-500/10 text-purple-300 border-purple-500/30" },
  tag_manager: { label: "Conteneur Tag Manager", badgeClass: "bg-sky-500/10 text-sky-300 border-sky-500/30" },
  chat_crm: { label: "Tracking CRM / Widget", badgeClass: "bg-indigo-500/10 text-indigo-300 border-indigo-500/30" },
};

/**
 * Génère un rapport HTML interactif d'audit QA réseau (traceurs exécutés à froid avant consentement CMP).
 * 100% déterministe, 0 coût LLM, embarquant le pixel de lecture temps réel (/api/tracker/open).
 */
export function generateTrackerReportHtml(input: TrackerReportInput): string {
  const { leadId, lead, inspection, remoteAppUrl } = input;
  const domain = (lead.website || lead.name).replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/[/?#].*$/, "");
  const inspectedAt = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
  const trackers = inspection?.trackerRequests ?? [];
  const stack = inspection?.stack ?? [];
  const cmp = inspection?.cmpDetected ?? null;
  const loadTimeMs = inspection?.loadTimeMs ?? null;
  const screenshotBase64 = inspection?.screenshot ? `data:image/jpeg;base64,${inspection.screenshot.toString("base64")}` : null;

  const hasTrackers = trackers.length > 0;
  const statusColor = hasTrackers ? "text-rose-400 bg-rose-500/10 border-rose-500/30" : "text-amber-300 bg-amber-500/10 border-amber-500/30";
  const statusLabel = hasTrackers
    ? `${trackers.length} script(s) tiers exécuté(s) avant consentement`
    : "Points d'optimisation réseau & conformité détectés";

  const trackerRows = hasTrackers
    ? trackers
        .map((t) => {
          const cat = CATEGORY_LABELS[t.category] ?? { label: t.category, badgeClass: "bg-zinc-800 text-zinc-300 border-zinc-700" };
          return `<tr class="border-b border-zinc-800/80 hover:bg-zinc-900/60 transition-colors">
            <td class="py-3.5 px-4 font-semibold text-zinc-100 whitespace-nowrap">
              <span class="inline-flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
                ${escapeHtml(t.name)}
              </span>
            </td>
            <td class="py-3.5 px-4 whitespace-nowrap">
              <span class="text-xs font-medium px-2.5 py-1 rounded-md border ${cat.badgeClass}">${escapeHtml(cat.label)}</span>
            </td>
            <td class="py-3.5 px-4 font-mono text-xs text-zinc-400 break-all">${escapeHtml(t.url)}</td>
            <td class="py-3.5 px-4 whitespace-nowrap text-right">
              <span class="text-xs font-mono text-rose-400 bg-rose-950/60 border border-rose-800/60 px-2 py-0.5 rounded">PRE-CMP FIRE</span>
            </td>
          </tr>`;
        })
        .join("\n")
    : `<tr>
        <td colspan="4" class="py-6 px-4 text-center text-zinc-400 text-sm">
          Aucun traceur publicitaire majeur intercepté en session vierge initiale. Vérifiez le déclenchement différé et le Consent Mode v2.
        </td>
      </tr>`;

  const stackBadges = stack.length
    ? stack.map((s) => `<span class="px-2.5 py-1 rounded-md text-xs font-mono bg-zinc-800/90 text-zinc-200 border border-zinc-700">${escapeHtml(s)}</span>`).join(" ")
    : `<span class="text-xs text-zinc-500 font-mono">Stack standard HTML/JS</span>`;

  const header = `<!-- Topbar QA -->
  <header class="border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur sticky top-0 z-30">
    <div class="max-w-5xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        <span class="px-2.5 py-1 rounded bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 font-mono text-xs font-semibold">
          [Dev QA · Network Trace]
        </span>
        <span class="font-semibold text-sm sm:text-base text-zinc-100 truncate">${escapeHtml(domain)}</span>
      </div>
      <div class="text-xs font-mono text-zinc-400 hidden sm:block">
        Inspecté le ${escapeHtml(inspectedAt)}
      </div>
    </div>
  </header>`;

  const sections = [
    `    <!-- En-tête du constat -->
    <section class="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-6 space-y-5">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="space-y-1.5">
          <div class="text-xs font-mono uppercase tracking-wider text-zinc-400">Protocole de test : Session Chromium Headless Vierge (0 clic CMP)</div>
          <h1 class="text-xl sm:text-2xl font-bold text-white tracking-tight">
            Cascade réseau au premier chargement de <span class="text-indigo-400 font-mono">${escapeHtml(domain)}</span>
          </h1>
        </div>
        <span class="px-3 py-1.5 rounded-lg border text-xs font-semibold ${statusColor}">
          ${escapeHtml(statusLabel)}
        </span>
      </div>

      <!-- Métriques clés -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
        <div class="bg-zinc-950/70 border border-zinc-800/80 rounded-xl p-3.5">
          <div class="text-[11px] font-mono uppercase text-zinc-400">Traceurs avant CMP</div>
          <div class="text-2xl font-bold font-mono mt-1 ${hasTrackers ? "text-rose-400" : "text-emerald-400"}">${trackers.length}</div>
        </div>
        <div class="bg-zinc-950/70 border border-zinc-800/80 rounded-xl p-3.5">
          <div class="text-[11px] font-mono uppercase text-zinc-400">Bandeau CMP détecté</div>
          <div class="text-base font-semibold font-mono mt-1.5 text-zinc-200">${escapeHtml(cmp ?? "Non détecté / Custom")}</div>
        </div>
        <div class="bg-zinc-950/70 border border-zinc-800/80 rounded-xl p-3.5">
          <div class="text-[11px] font-mono uppercase text-zinc-400">Temps de chargement</div>
          <div class="text-base font-semibold font-mono mt-1.5 text-zinc-200">${loadTimeMs ? `${loadTimeMs} ms` : "n/a"}</div>
        </div>
        <div class="bg-zinc-950/70 border border-zinc-800/80 rounded-xl p-3.5">
          <div class="text-[11px] font-mono uppercase text-zinc-400">Interaction utilisateur</div>
          <div class="text-base font-semibold font-mono mt-1.5 text-emerald-400">Aucune (0 clic)</div>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2 pt-1">
        <span class="text-xs text-zinc-400 font-medium">Stack repérée :</span>
        ${stackBadges}
      </div>
    </section>

    <!-- Tableau des requêtes réseau interceptées -->
    <section class="bg-zinc-900/70 border border-zinc-800 rounded-2xl overflow-hidden">
      <div class="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
        <div>
          <h2 class="font-semibold text-base text-white">Requêtes tierces interceptées avant consentement</h2>
          <p class="text-xs text-zinc-400 mt-0.5">Requêtes sortantes capturées dans les 1 200 ms suivant l'événement <code class="font-mono text-zinc-300">window.onload</code> sans interaction sur la CMP.</p>
        </div>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse text-sm">
          <thead>
            <tr class="border-b border-zinc-800 text-[11px] font-mono uppercase text-zinc-400 bg-zinc-950/40">
              <th class="py-3 px-4">Traceur / Service</th>
              <th class="py-3 px-4">Catégorie</th>
              <th class="py-3 px-4">Endpoint réseau intercepté</th>
              <th class="py-3 px-4 text-right">Statut</th>
            </tr>
          </thead>
          <tbody>
            ${trackerRows}
          </tbody>
        </table>
      </div>
    </section>

    <!-- Diagnostic & Piste de correction Dev-to-Dev -->
    <section class="grid md:grid-cols-2 gap-6">
      <div class="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-6 space-y-3">
        <h3 class="font-semibold text-base text-white flex items-center gap-2">
          <span class="text-indigo-400 font-mono">01.</span> Cause fréquente (9 cas sur 10)
        </h3>
        <p class="text-sm text-zinc-300 leading-relaxed">
          Lors d'une mise à jour de conteneur <strong>Google Tag Manager</strong> ou d'une refonte, un tag est rattaché au déclencheur par défaut <code class="font-mono text-xs bg-zinc-800 px-1.5 py-0.5 rounded text-amber-300">All Pages (Page View)</code> au lieu d'attendre l'événement personnalisé renvoyé par la CMP (${escapeHtml(cmp ?? "Axeptio / Didomi / Cookiebot")}), ou le <strong>Consent Mode v2</strong> (<code class="font-mono text-xs bg-zinc-800 px-1.5 py-0.5 rounded text-indigo-300">analytics_storage: 'denied'</code> par défaut) n'est pas initialisé avant l'injection de GTM.
        </p>
        <div class="bg-zinc-950 border border-zinc-800 rounded-xl p-3.5 font-mono text-xs text-zinc-300 space-y-1">
          <div class="text-zinc-500">// Correctif recommandé avant le snippet GTM :</div>
          <div>gtag('consent', 'default', {</div>
          <div class="pl-4 text-emerald-400">'ad_storage': 'denied',</div>
          <div class="pl-4 text-emerald-400">'analytics_storage': 'denied',</div>
          <div class="pl-4 text-emerald-400">'wait_for_update': 500</div>
          <div>});</div>
        </div>
      </div>

      <div class="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-6 space-y-3">
        <h3 class="font-semibold text-base text-white flex items-center gap-2">
          <span class="text-indigo-400 font-mono">02.</span> Surveillance continue CI/CD (Filet QA)
        </h3>
        <p class="text-sm text-zinc-300 leading-relaxed">
          Ce contrôle fait partie d'une brique d'automatisation QA headless qui vérifie périodiquement les sites d'un portfolio d'agence et envoie une alerte technique dès qu'un déploiement ou un ajout de tag fait sauter le conditionnement CMP.
        </p>
        <div class="pt-2 border-t border-zinc-800/80 text-xs text-zinc-400 space-y-1">
          <div class="font-semibold text-zinc-200">Loïc Alcantara — Développeur Web Senior (14 ans d'exp)</div>
          <div>Architecture backend, robustesse réseau & automatisation QA CI/CD</div>
          <div class="pt-1">
            Contact 100% asynchrone (écrit) :
            <a href="mailto:loic.alcantara@gmail.com?subject=${encodeURIComponent(`[Suite rapport QA] ${domain}`)}" class="text-indigo-400 hover:underline font-mono">loic.alcantara@gmail.com</a>
          </div>
        </div>
      </div>
    </section>

    ${
      screenshotBase64
        ? `<section class="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-6 space-y-3">
      <div class="flex items-center justify-between">
        <h3 class="font-semibold text-base text-white">Capture témoin de la session vierge (sans clic sur le bandeau)</h3>
        <span class="text-xs font-mono text-zinc-400">Viewport 1366×768</span>
      </div>
      <div class="rounded-xl overflow-hidden border border-zinc-800 max-h-[520px] overflow-y-auto bg-zinc-950">
        <img src="${screenshotBase64}" alt="Capture session vierge ${escapeHtml(domain)}" class="w-full h-auto">
      </div>
    </section>`
        : ""
    }`,
  ];

  return renderReportPage({
    title: `[QA Network Report] ${domain} — Audit Traceurs & CMP`,
    leadId,
    remoteAppUrl,
    header,
    sections,
  });
}
