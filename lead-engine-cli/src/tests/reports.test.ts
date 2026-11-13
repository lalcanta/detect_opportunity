import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateVisibilityReportHtml } from "../generator/visibilityReportGenerator";
import { generateAcquisitionReportHtml } from "../generator/acquisitionReportGenerator";
import { renderReportPage, renderScoreBadge, buildReportAudit } from "../generator/reportLayout";
import { visibilityScore } from "../generator/reportScoring";
import { generateTrackerReportHtml } from "../generator/trackerReportGenerator";
import type { MapsLead, SiteInspection, SeoOnPage } from "../types";
import type { CompetitorPixels } from "../collector/competitorPixels";

const comp = (name: string, rank: number, rating: number | null, reviewsCount: number | null) => ({
  name, rank, rating, reviewsCount, website: null, category: null,
});
function lead(over: Partial<MapsLead> = {}): MapsLead {
  return {
    name: "Dupont Plomberie", activity: "plombier", city: "Lyon", phone: "0400000000", website: "https://d.fr",
    rating: 4.2, reviewsCount: 30, recentReviews: [], mapsUrl: "", placeId: null,
    mapsRank: 4, mapsQuery: "plombier Lyon", mapsCheckedAt: "2026-11-13T10:00:00.000Z",
    competitors: [comp("Martin", 1, 4.8, 120), comp("Durand", 2, 4.6, 90), comp("Petit", 3, null, null)],
    ...over,
  };
}
const seo = (over: Partial<SeoOnPage> = {}): SeoOnPage => ({
  title: "t", metaDescription: "d", h1: "h", hasLocalBusinessSchema: false, phones: [], hasTelLink: false,
  activityInTitleOrH1: true, cityInTitleOrH1: false, phoneMatchesListing: true, ...over,
});
function insp(over: Partial<SiteInspection> = {}): SiteInspection {
  return {
    url: "https://d.fr", loadTimeMs: 1800, isResponsive: true, dominantColors: [], logoUrl: null, screenshot: null,
    isHttps: true, seo: seo(), trackersFound: [], cmpDetected: null, paidAdsDetected: [], contactForm: null, ...over,
  };
}
const base = { leadId: "aabbccddeeff0011", remoteAppUrl: "https://app.test", siteDemoUrl: null as string | null };
const vis = (l = lead(), i: SiteInspection | null = insp(), siteDemoUrl: string | null = null) =>
  generateVisibilityReportHtml({ ...base, lead: l, inspection: i, siteDemoUrl });
const acq = (px: CompetitorPixels[] = [], l = lead(), i: SiteInspection | null = insp(), siteDemoUrl: string | null = null) =>
  generateAcquisitionReportHtml({ ...base, lead: l, inspection: i, competitorPixels: px, siteDemoUrl });

function inOrder(html: string, marks: string[]) {
  let at = -1;
  for (const m of marks) {
    const idx = html.indexOf(m, at + 1);
    assert.ok(idx > at, `« ${m} » absent ou hors ordre`);
    at = idx;
  }
}

describe("renderReportPage / renderScoreBadge", () => {
  it("document complet avec pixel de lecture", () => {
    const h = renderReportPage({ title: "T <x>", leadId: "abc", remoteAppUrl: "https://a.test", header: "<header>H</header>", sections: ["<section>S1</section>", "<section>S2</section>"] });
    assert.ok(h.startsWith("<!DOCTYPE html>"));
    assert.ok(h.includes("/api/tracker/open?leadId=abc"));
    assert.ok(h.includes("T &lt;x&gt;"));
    inOrder(h, ["H", "S1", "S2"]);
  });
  it("infobulle : points par critère, critères non mesurés, survol et toucher", () => {
    const r = visibilityScore(lead({ website: null }), null);
    const b = renderScoreBadge(r);
    assert.ok(b.includes("data-score-toggle"));
    assert.ok(b.includes("group-hover:"));
    assert.ok(b.includes('tabindex="0"'));
    assert.ok(b.includes("Position sur Google Maps"));
    assert.ok(b.includes("0/25"));
    assert.ok(b.includes("non mesuré"));
    assert.ok(b.includes("Site relié à la fiche"));
    assert.ok(b.includes(`${r.score}`));
  });
  it("buildReportAudit : faiblesses = actions du score", () => {
    const r = visibilityScore(lead(), insp());
    const a = buildReportAudit(r, "Résumé");
    assert.equal(a.summary, "Résumé");
    assert.equal(a.score, r.score);
    assert.ok(a.weaknesses.length > 0 && a.weaknesses.length <= 3);
  });
});

describe("bilan visibilité", () => {
  it("sections dans l'ordre de la spec", () => {
    const h = vis(lead(), insp(), "https://app.test/demos/x/site");
    inOrder(h, ["Dupont Plomberie", "Votre position sur Google Maps", "Vos avis", "Votre fiche", "Votre site", "Actions prioritaires"]);
  });
  it("recherche telle que lancée et date en français", () => {
    const h = vis();
    assert.ok(h.includes("plombier Lyon"));
    assert.ok(h.includes("13 novembre 2026"));
  });
  it("rang 4 : concurrents mieux classés listés avec valeurs manquantes en tiret", () => {
    const h = vis();
    for (const n of ["Martin", "Durand", "Petit"]) assert.ok(h.includes(n));
    assert.ok(h.includes("—"));
    assert.ok(!h.includes("en tête"));
  });
  it("rang 1 : en tête et suivants listés", () => {
    const h = vis(lead({ mapsRank: 1, competitors: [comp("Suivant Un", 2, 4.0, 10), comp("Suivant Deux", 3, 3.9, 5)] }));
    assert.ok(h.includes("en tête"));
    assert.ok(h.includes("Suivant Un") && h.includes("Suivant Deux"));
  });
  it("sans mapsRank : pas de section position", () => {
    const h = vis(lead({ mapsRank: null }));
    assert.ok(!h.includes("Votre position sur Google Maps"));
  });
  it("lien démo complémentaire seulement si fourni", () => {
    assert.ok(vis(lead(), insp(), "https://app.test/demos/x/site").includes("Voir à quoi pourrait ressembler votre site"));
    assert.ok(vis(lead(), insp(), "https://app.test/demos/x/site").includes('href="https://app.test/demos/x/site"'));
    assert.ok(!vis().includes("Voir à quoi pourrait ressembler votre site"));
  });
  it("sans site : constat « pas de site », pas de détail de site", () => {
    const h = vis(lead({ website: null }), null);
    assert.ok(h.includes("pas de site"));
    assert.ok(!h.includes("Temps de chargement"));
  });
  it("sans site : le lien vers la démo complémentaire est proposé sous la fiche", () => {
    const h = vis(lead({ website: null }), null, "https://app.test/demos/x/site");
    assert.ok(h.includes('href="https://app.test/demos/x/site"'));
    assert.ok(!vis(lead({ website: null }), null).includes("Voir à quoi pourrait ressembler votre site"));
  });
  it("concurrent hostile échappé partout (tableau et infobulle)", () => {
    const evil = 'Dupont <b>&"';
    const h = vis(lead({ competitors: [comp(evil, 1, 4.9, 10)] }));
    assert.ok(!h.includes("Dupont <b>"));
    assert.ok(h.includes("Dupont &lt;b&gt;&amp;&quot;"));
  });
  it("aucun lien bibliothèque Meta, aucun chiffre non mesuré", () => {
    const h = vis();
    assert.ok(!/facebook\.com\/ads|adlibrary/i.test(h));
    assert.ok(!/appels perdus|chiffre d'affaires|trafic/i.test(h));
  });
});

describe("bilan acquisition", () => {
  const px: CompetitorPixels[] = [
    { name: "Martin", rank: 1, website: "https://m.fr", pixels: ["Google Ads (Conversion AW-)", "Meta Ads (Facebook Pixel)"] },
    { name: "Durand", rank: 2, website: "https://du.fr", pixels: [] },
    { name: "Petit", rank: 3, website: "https://p.fr", pixels: null },
  ];
  it("sections dans l'ordre de la spec", () => {
    const h = acq(px, lead(), insp({ paidAdsDetected: ["Meta Ads (Facebook Pixel)"], cmpDetected: "Axeptio" }), "https://app.test/demos/x/site");
    inOrder(h, ["Dupont Plomberie", "13 novembre 2026", "Ce qui est installé sur votre site", "Vos concurrents", "Votre page d'arrivée", "Actions prioritaires"]);
    assert.ok(h.includes("Voir à quoi pourrait ressembler votre site"));
    assert.ok(h.includes("Axeptio"));
  });
  it("concurrents : mesure ses appels, aucun pixel, non vérifié", () => {
    const h = acq(px);
    assert.ok(h.includes("mesure ses appels"));
    assert.ok(h.includes("non vérifié"));
    assert.ok(h.includes("Aucun pixel"));
  });
  it("pas de démo → pas de lien ; pas de lien bibliothèque Meta", () => {
    const h = acq(px);
    assert.ok(!h.includes("Voir à quoi pourrait ressembler votre site"));
    assert.ok(!/facebook\.com\/ads|adlibrary/i.test(h));
  });
  it("nom de concurrent échappé", () => {
    const h = acq([{ name: 'Dupont <b>&"', rank: 1, website: "x", pixels: [] }]);
    assert.ok(h.includes("Dupont &lt;b&gt;&amp;&quot;"));
    assert.ok(!h.includes("Dupont <b>"));
  });
});

describe("garde-fous des bilans", () => {
  it("siteDemoUrl : seuls http(s) et /demos/ donnent un lien", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "//evil.test/x", "ftp://x"]) {
      assert.ok(!vis(lead(), insp(), bad).includes("Voir à quoi pourrait ressembler votre site"), bad);
      assert.ok(!acq([], lead(), insp(), bad).includes("Voir à quoi pourrait ressembler votre site"), bad);
    }
    assert.ok(vis(lead(), insp(), "/demos/abc/site").includes('href="/demos/abc/site"'));
    assert.ok(vis(lead(), insp(), "http://a.test/x").includes("Voir à quoi pourrait ressembler votre site"));
  });
  it("recherche absente : ni ligne de recherche ni reconstruction métier + ville", () => {
    const h = vis(lead({ mapsQuery: null }));
    assert.ok(!h.includes("Recherche Google Maps"));
    assert.ok(!h.includes("plombier Lyon"));
    assert.ok(!h.includes("pour la recherche"));
  });
  it("date absente ou invalide : pas de ligne « Constat du »", () => {
    for (const d of [null, undefined, "pas une date"]) {
      assert.ok(!vis(lead({ mapsCheckedAt: d })).includes("Constat du"));
      assert.ok(!acq([], lead({ mapsCheckedAt: d })).includes("Constat du"));
    }
    assert.ok(vis().includes("Constat du 13 novembre 2026"));
  });
  it("infobulle : critère earned null dans criteria affiché « non mesuré », pas 0/max", () => {
    const b = renderScoreBadge({ score: 50, criteria: [{ id: "x", label: "Critère X", max: 10, earned: null }], removed: [] });
    assert.ok(b.includes("non mesuré"));
    assert.ok(!b.includes("0/10"));
  });
});

describe("rapport RGPD (non-régression de la mise en page)", () => {
  it("titre, pixel, sections et pied inchangés", () => {
    const html = generateTrackerReportHtml({
      leadId: "aabbccddeeff0011",
      lead: { name: "Digidop", activity: "Agence Web", city: "Paris", phone: null, website: "https://www.digidop.fr", rating: 5, reviewsCount: 1, recentReviews: [], mapsUrl: "", placeId: null },
      inspection: { url: "https://www.digidop.fr", loadTimeMs: 1000, isResponsive: true, dominantColors: [], logoUrl: null, screenshot: null, cmpDetected: "Axeptio",
        trackerRequests: [{ name: "Hotjar", category: "heatmap_ux", url: "https://static.hotjar.com/c.js" }] },
      remoteAppUrl: "http://localhost:8788",
    });
    assert.ok(html.startsWith("<!DOCTYPE html>"));
    assert.ok(html.includes("<title>[QA Network Report] digidop.fr — Audit Traceurs &amp; CMP</title>"));
    assert.ok(html.includes("/api/tracker/open?leadId=aabbccddeeff0011"));
    inOrder(html, ["Dev QA · Network Trace", "Cascade réseau au premier chargement", "Requêtes tierces interceptées avant consentement", "Cause fréquente", "Surveillance continue CI/CD", "</main>", "/api/tracker/open"]);
    assert.ok(html.includes("PRE-CMP FIRE"));
    assert.equal((html.match(/<main/g) ?? []).length, 1);
  });
});

describe("bilan visibilité — lead en tête : phrase tirée des avis mesurés", () => {
  const top = (reviewsCount: number | null, next: ReturnType<typeof comp>[]) => vis(lead({ mapsRank: 1, reviewsCount, competitors: next }));
  it("un suivant a plus d'avis (61 contre 80) : il est nommé, pas d'« avance »", () => {
    const h = top(61, [comp("Durand <b>", 2, 4.5, 80), comp("Petit", 3, 4.1, 20)]);
    assert.ok(!h.includes("garder l'avance"));
    assert.ok(h.includes("Durand &lt;b&gt;"));
    assert.ok(!h.includes("Durand <b>"));
    assert.ok(/80 avis contre 61/.test(h), "chiffres comparés");
  });
  it("plus d'avis que tous les suivants", () => {
    const h = top(120, [comp("Durand", 2, 4.5, 80), comp("Petit", 3, 4.1, 20)]);
    assert.ok(/plus d'avis que les suivants/.test(h));
    assert.ok(/120 contre 80 au plus/.test(h));
  });
  it("autant d'avis que le mieux pourvu des suivants", () => {
    const h = top(80, [comp("Durand", 2, 4.5, 80)]);
    assert.ok(/autant d'avis/.test(h));
  });
  it("avis non mesurés (lead ou suivants) : aucune comparaison", () => {
    for (const h of [top(null, [comp("Durand", 2, 4.5, 80)]), top(61, [comp("Durand", 2, 4.5, null)]), top(61, [])]) {
      assert.ok(h.includes("en tête"));
      assert.ok(!/garder l'avance|plus d'avis|autant d'avis|avis contre/.test(h));
    }
  });
});

describe("bilan acquisition — rang des concurrents et recherche Maps", () => {
  const px: CompetitorPixels[] = [{ name: "Martin", rank: 1, website: "https://m.fr", pixels: [] }];
  it("recherche connue : ligne « Recherche Google Maps » affichée avec la colonne Rang", () => {
    const h = acq(px);
    assert.ok(h.includes("Recherche Google Maps : <strong class=\"text-white\">« plombier Lyon »</strong>"));
    assert.ok(h.includes(">Rang<"));
  });
  it("recherche hostile échappée", () => {
    const h = acq(px, lead({ mapsQuery: "plombier <b>" }));
    assert.ok(h.includes("plombier &lt;b&gt;"));
    assert.ok(!h.includes("plombier <b>"));
  });
  it("recherche inconnue : ni ligne de recherche ni colonne Rang", () => {
    const h = acq(px, lead({ mapsQuery: null }));
    assert.ok(!h.includes("Recherche Google Maps"));
    assert.ok(!h.includes(">Rang<"));
    assert.ok(h.includes("Martin"));
  });
});

describe("actions du bilan", () => {
  it("titre « Actions prioritaires » (pas « Trois » quand il y en a moins)", () => {
    const h = vis();
    assert.ok(h.includes("Actions prioritaires"));
    assert.ok(!h.includes("Trois actions"));
  });
});

describe("bilan visibilité — prospect sans fiche Maps (scan par liste de domaines)", () => {
  const noListing = () => lead({ noMapsListing: true, mapsRank: null, mapsQuery: null, competitors: [], rating: null, reviewsCount: null, activity: "Agence / Digital", city: "France", phone: null });
  const h = () => vis(noListing(), insp({ seo: seo({ activityInTitleOrH1: false, cityInTitleOrH1: false, phoneMatchesListing: null }) }));
  it("avis et fiche « non mesuré », sans catégorie ni lien de fiche inventés", () => {
    const html = h();
    assert.ok(html.includes("Vos avis") && html.includes("Votre fiche"));
    assert.ok(!html.includes("Agence / Digital"));
    assert.ok(!html.includes("la fiche renvoie vers votre site"));
    assert.ok(!html.includes("0/15"));
    const avis = html.slice(html.indexOf("Vos avis"), html.indexOf("Votre fiche"));
    assert.ok(avis.includes("non mesuré"));
    const fiche = html.slice(html.indexOf("Votre fiche"), html.indexOf("Votre site"));
    assert.ok(fiche.includes("non mesuré"));
  });
  it("métier et ville du titre « non mesuré », jamais « absent »", () => {
    const site = h().slice(h().indexOf("Votre site"));
    assert.ok(/Métier dans le titre ou le H1<\/span> <span class="text-zinc-400">— non mesuré/.test(site));
    assert.ok(/Ville dans le titre ou le H1<\/span> <span class="text-zinc-400">— non mesuré/.test(site));
  });
});

describe("bilan acquisition — bandeau de consentement", () => {
  it("identifiants trouvés : « présent (déclenché après consentement) »", () => {
    const h = acq([], lead(), insp({ cmpDetected: "Axeptio", trackersFound: [], paidAdsDetected: [], htmlTagIds: { analytics: ["GTM-ABCD12"], googleAds: [], metaPixel: [] } }));
    assert.ok(h.includes("Google Tag Manager — présent (déclenché après consentement)"));
    assert.ok(!h.includes("Aucun outil de suivi détecté"));
    assert.ok(!h.includes("Aucun pixel publicitaire détecté"));
    assert.ok(!h.includes("Installer"));
  });
  it("aucun identifiant : non mesuré, jamais « aucun »", () => {
    const h = acq([], lead(), insp({ cmpDetected: "Axeptio", trackersFound: [], paidAdsDetected: [], htmlTagIds: { analytics: [], googleAds: [], metaPixel: [] } }));
    assert.ok(!h.includes("Aucun outil de suivi détecté"));
    assert.ok(!h.includes("Aucun pixel publicitaire détecté"));
    assert.ok(/non mesuré : le bandeau de consentement/.test(h));
  });
  it("sans bandeau : « Aucun outil de suivi détecté » reste vrai", () => {
    const h = acq([], lead(), insp({ cmpDetected: null, trackersFound: [], paidAdsDetected: [] }));
    assert.ok(h.includes("Aucun outil de suivi détecté"));
  });
});
