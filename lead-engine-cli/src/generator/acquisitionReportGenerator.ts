import type { MapsLead, SiteInspection } from "../types";
import type { CompetitorPixels } from "../collector/competitorPixels";
import { escapeHtml } from "../utils/helpers";
import { acquisitionScore } from "./reportScoring";
import { dateFr, renderActions, renderCard, renderCheck, renderReportPage, renderScoreBadge, renderSiteDemoLink, renderTable } from "./reportLayout";

export interface AcquisitionReportInput {
  leadId: string;
  lead: MapsLead;
  inspection: SiteInspection | null;
  competitorPixels: CompetitorPixels[];
  remoteAppUrl: string;
  siteDemoUrl: string | null;
}

const GOOGLE_ADS = "Google Ads (Conversion AW-)";

/** Bilan « acquisition » : déterministe, concurrents = données publiques uniquement. */
export function generateAcquisitionReportHtml(input: AcquisitionReportInput): string {
  const { leadId, lead, inspection, competitorPixels, remoteAppUrl, siteDemoUrl } = input;
  const result = acquisitionScore(inspection, competitorPixels);
  const i = inspection;

  const header = `<header class="border-b border-zinc-800/80 bg-zinc-950/90">
    <div class="max-w-5xl mx-auto px-4 sm:px-6 py-6 flex flex-wrap items-start justify-between gap-4">
      <div class="space-y-1.5 min-w-0">
        <div class="text-xs uppercase tracking-wider text-indigo-400 font-semibold">Bilan d'acquisition</div>
        <h1 class="text-2xl sm:text-3xl font-bold text-white tracking-tight break-words">${escapeHtml(lead.name)}</h1>
        <p class="text-xs text-zinc-400">Constat du ${escapeHtml(dateFr(lead.mapsCheckedAt))}</p>
      </div>
      ${renderScoreBadge(result)}
    </div>
  </header>`;

  const sections: string[] = [];

  const ads = i?.paidAdsDetected;
  const trackers = i?.trackersFound;
  const chips = (list: string[], empty: string) =>
    list.length
      ? list.map((t) => `<span class="px-2.5 py-1 rounded-md text-xs bg-zinc-800/90 text-zinc-200 border border-zinc-700">${escapeHtml(t)}</span>`).join(" ")
      : `<span class="text-sm text-zinc-400">${escapeHtml(empty)}</span>`;
  const cmp = i?.cmpDetected;
  sections.push(renderCard("Ce qui est installé sur votre site",
    `<div class="space-y-4">
      <div><div class="text-xs uppercase tracking-wide text-zinc-400 mb-1.5">Pixels publicitaires</div><div class="flex flex-wrap gap-2">${ads ? chips(ads, "Aucun pixel publicitaire détecté") : `<span class="text-sm text-zinc-400">non mesuré</span>`}</div></div>
      <div><div class="text-xs uppercase tracking-wide text-zinc-400 mb-1.5">Suivi et mesure d'audience</div><div class="flex flex-wrap gap-2">${trackers ? chips(trackers, "Aucun outil de suivi détecté") : `<span class="text-sm text-zinc-400">non mesuré</span>`}</div></div>
      <ul>${renderCheck("Bandeau de consentement", cmp === undefined || !i ? null : !!cmp, cmp === undefined || !i ? "non mesuré" : cmp ? `détecté (${cmp})` : "non détecté")}</ul>
    </div>`));

  const rows = [...competitorPixels].sort((a, b) => a.rank - b.rank).map((c) => {
    let txt: string;
    if (c.pixels === null) txt = "non vérifié";
    else if (c.pixels.length === 0) txt = "Aucun pixel détecté";
    else txt = c.pixels.join(", ") + (c.pixels.includes(GOOGLE_ADS) ? " — mesure ses appels" : "");
    return [c.name, `${c.rank}`, txt];
  });
  sections.push(renderCard("Vos concurrents",
    rows.length
      ? renderTable(["Établissement", "Rang", "Pixels trouvés sur son site"], rows, 99)
      : `<p class="text-sm text-zinc-400">Aucun concurrent avec un site à comparer pour cette recherche.</p>`,
    "Données publiques de leur site, relevées à la date du constat."));

  const tel = i?.seo ? i.seo.hasTelLink : null;
  const form = !i || i.contactForm === undefined ? null : !!i.contactForm;
  const mobile = i?.isResponsive ?? null;
  const ms = i?.loadTimeMs;
  const demo = renderSiteDemoLink(siteDemoUrl);
  sections.push(renderCard("Votre page d'arrivée",
    `<ul class="space-y-2.5">${[
      renderCheck("Numéro cliquable (lien tel:)", tel, tel === null ? "non mesuré" : tel ? "présent" : "absent"),
      renderCheck("Formulaire de contact", form, form === null ? "non mesuré" : form ? "présent" : "absent"),
      renderCheck("Adaptation mobile", mobile, mobile === null ? "non mesuré" : mobile ? "adaptée au mobile" : "pas adaptée au mobile"),
      renderCheck("Temps de chargement", typeof ms === "number" ? ms <= 3000 : null, typeof ms === "number" ? `${(ms / 1000).toFixed(1).replace(".", ",")} s mesuré` : "non mesuré"),
    ].join("")}</ul>${demo ? `<div class="pt-2">${demo}</div>` : ""}`));

  sections.push(renderActions(result));

  return renderReportPage({
    title: `Bilan d'acquisition — ${lead.name}`,
    leadId, remoteAppUrl, header, sections,
  });
}
