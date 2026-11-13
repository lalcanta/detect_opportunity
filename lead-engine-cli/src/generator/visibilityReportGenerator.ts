import type { MapsCompetitor, MapsLead, SiteInspection } from "../types";
import { escapeHtml } from "../utils/helpers";
import { visibilityScore } from "./reportScoring";
import { renderCheckedAt, renderActions, renderCard, renderCheck, renderReportPage, renderScoreBadge, renderSiteDemoLink, renderTable } from "./reportLayout";

export interface VisibilityReportInput {
  leadId: string;
  lead: MapsLead;
  inspection: SiteInspection | null;
  remoteAppUrl: string;
  siteDemoUrl: string | null;
}

const num = (v: number | null | undefined): string => (typeof v === "number" ? String(v) : "—");
const rate = (v: number | null | undefined): string => (typeof v === "number" ? v.toFixed(1).replace(".", ",") : "—");
const avg = (v: number[]): number | null => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : null);

/**
 * Lead en tête : comparaison de son nombre d'avis à celui des suivants, uniquement si les deux sont mesurés
 * (texte déjà échappé, précédé d'une espace ; vide sinon).
 */
function reviewsVersNext(own: number | null | undefined, next: MapsCompetitor[]): string {
  if (typeof own !== "number") return "";
  const counted = next.filter((c): c is MapsCompetitor & { reviewsCount: number } => typeof c.reviewsCount === "number");
  if (!counted.length) return "";
  const best = counted.reduce((a, b) => (b.reviewsCount > a.reviewsCount ? b : a));
  if (own > best.reviewsCount) return ` Vous avez plus d'avis que les suivants (${own} contre ${best.reviewsCount} au plus).`;
  if (own === best.reviewsCount) return ` Vous avez autant d'avis que le mieux pourvu des suivants (${own}).`;
  return ` ${escapeHtml(best.name)} vous suit mais compte plus d'avis : ${best.reviewsCount} avis contre ${own}.`;
}

/** Bilan « visibilité locale » : déterministe, aucun chiffre non mesuré. */
export function generateVisibilityReportHtml(input: VisibilityReportInput): string {
  const { leadId, lead, inspection, remoteAppUrl, siteDemoUrl } = input;
  const result = visibilityScore(lead, inspection);
  const competitors = [...(lead.competitors ?? [])].sort((a, b) => a.rank - b.rank);
  const query = lead.mapsQuery?.trim() || null;
  const forQuery = query ? ` pour la recherche « ${escapeHtml(query)} »` : "";
  const rank = typeof lead.mapsRank === "number" ? lead.mapsRank : null;
  const listing = !lead.noMapsListing;
  const noListing = "non mesuré : aucune fiche Google Maps relevée pour ce prospect";

  const header = `<header class="border-b border-zinc-800/80 bg-zinc-950/90">
    <div class="max-w-5xl mx-auto px-4 sm:px-6 py-6 flex flex-wrap items-start justify-between gap-4">
      <div class="space-y-1.5 min-w-0">
        <div class="text-xs uppercase tracking-wider text-indigo-400 font-semibold">Bilan de visibilité locale</div>
        <h1 class="text-2xl sm:text-3xl font-bold text-white tracking-tight break-words">${escapeHtml(lead.name)}</h1>
        ${query ? `<p class="text-sm text-zinc-300">Recherche Google Maps : <strong class="text-white">« ${escapeHtml(query)} »</strong></p>` : ""}
        ${renderCheckedAt(lead.mapsCheckedAt)}
      </div>
      ${renderScoreBadge(result)}
    </div>
  </header>`;

  const sections: string[] = [];

  if (rank !== null) {
    const row = (c: (typeof competitors)[number]) => [`${c.rank}`, c.name, rate(c.rating), num(c.reviewsCount)];
    const heads = ["Rang", "Établissement", "Note", "Avis"];
    if (rank === 1) {
      const next = competitors.filter((c) => c.rank > 1);
      const gap = next.length
        ? `<p class="text-sm text-zinc-300">Les suivants dans la recherche :</p>${renderTable(heads, next.map(row), 2)}`
        : "";
      sections.push(renderCard("Votre position sur Google Maps",
        `<p class="text-sm text-zinc-200">Vous êtes <strong class="text-emerald-400">en tête</strong>${forQuery}.${reviewsVersNext(lead.reviewsCount, next)}</p>${gap}`));
    } else {
      const ahead = competitors.filter((c) => c.rank < rank);
      sections.push(renderCard("Votre position sur Google Maps",
        `<p class="text-sm text-zinc-200">Votre fiche apparaît en <strong class="text-white">position ${rank}</strong>${forQuery}.</p>${
          ahead.length ? `<p class="text-sm text-zinc-300">Les établissements mieux classés :</p>${renderTable(heads, ahead.map(row), 2)}` : ""}`));
    }
  }

  const ratings = competitors.map((c) => c.rating).filter((v): v is number => typeof v === "number");
  const reviews = competitors.map((c) => c.reviewsCount).filter((v): v is number => typeof v === "number");
  const avgRating = avg(ratings);
  const avgReviews = avg(reviews);
  const fmt = (v: number | null, d = 1) => (v === null ? "—" : v.toFixed(d).replace(".", ","));
  sections.push(renderCard("Vos avis", !listing ? `<ul>${renderCheck("Avis Google", null, noListing)}</ul>` :
    renderTable(
      ["", "Note", "Avis"],
      [
        ["Votre fiche", rate(lead.rating), num(lead.reviewsCount)],
        ["Moyenne des concurrents listés", fmt(avgRating), fmt(avgReviews, 0)],
        ["Maximum des concurrents listés", ratings.length ? fmt(Math.max(...ratings)) : "—", reviews.length ? String(Math.max(...reviews)) : "—"],
      ],
    )));

  const hasSite = !!lead.website;
  // Sans site, la démo complémentaire se propose sous la fiche (il n'y a pas de carte « Votre site »).
  const demoNoSite = hasSite ? "" : renderSiteDemoLink(siteDemoUrl);
  sections.push(renderCard("Votre fiche", !listing ? `<ul>${renderCheck("Fiche Google Maps", null, noListing)}</ul>` :
    `<ul class="space-y-2.5">${[
      renderCheck("Site web relié", hasSite, hasSite ? "la fiche renvoie vers votre site" : lead.listingUrl ? "pas de site : la fiche renvoie vers une page d'annuaire ou de réseau social" : "pas de site relié à la fiche"),
      renderCheck("Catégorie affichée", lead.activity?.trim() ? true : false, lead.activity?.trim() || "aucune catégorie renseignée"),
    ].join("")}</ul>${demoNoSite ? `<div class="pt-2">${demoNoSite}</div>` : ""}`));

  if (hasSite) {
    const s = inspection?.seo;
    const yn = (v: boolean | null | undefined, yes: string, no: string, unknown = "non mesuré"): [boolean | null, string] =>
      v === null || v === undefined ? [null, unknown] : v ? [true, yes] : [false, no];
    const items: string[] = [];
    if (s) {
      // Sans fiche Maps, métier et ville ne sont pas connus : rien à chercher dans le titre.
      items.push(renderCheck("Métier dans le titre ou le H1", listing ? s.activityInTitleOrH1 : null, !listing ? "non mesuré" : s.activityInTitleOrH1 ? "présent" : "absent"));
      items.push(renderCheck("Ville dans le titre ou le H1", listing ? s.cityInTitleOrH1 : null, !listing ? "non mesuré" : s.cityInTitleOrH1 ? "présente" : "absente"));
      items.push(renderCheck("Description de la page", !!s.metaDescription, s.metaDescription ? "présente" : "absente"));
      const [pOk, pTxt] = yn(s.phoneMatchesListing, "identique à la fiche", "différent de la fiche");
      items.push(renderCheck("Téléphone", pOk, pTxt));
      items.push(renderCheck("Données structurées d'entreprise locale", s.hasLocalBusinessSchema, s.hasLocalBusinessSchema ? "présentes" : "absentes"));
    } else {
      items.push(renderCheck("Contenu de la page d'accueil", null, "non mesuré"));
    }
    const [mOk, mTxt] = yn(inspection?.isResponsive, "adapté au mobile", "pas adapté au mobile");
    items.push(renderCheck("Adaptation mobile", mOk, mTxt));
    const [hOk, hTxt] = yn(inspection?.isHttps, "site sécurisé", "site non sécurisé");
    items.push(renderCheck("HTTPS", hOk, hTxt));
    const ms = inspection?.loadTimeMs;
    items.push(renderCheck("Temps de chargement", typeof ms === "number" ? ms <= 3000 : null, typeof ms === "number" ? `${(ms / 1000).toFixed(1).replace(".", ",")} s mesuré` : "non mesuré"));
    const demo = renderSiteDemoLink(siteDemoUrl);
    sections.push(renderCard("Votre site", `<ul class="space-y-2.5">${items.join("")}</ul>${demo ? `<div class="pt-2">${demo}</div>` : ""}`));
  }

  sections.push(renderActions(result));

  return renderReportPage({
    title: `Bilan de visibilité locale — ${lead.name}`,
    leadId, remoteAppUrl, header, sections,
  });
}
