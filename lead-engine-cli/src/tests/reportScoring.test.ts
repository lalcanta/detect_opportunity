import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { visibilityScore, acquisitionScore, scoreActions } from "../generator/reportScoring";
import type { MapsLead, SiteInspection, SeoOnPage } from "../types";
import type { CompetitorPixels } from "../collector/competitorPixels";

const comp = (rating: number | null, reviewsCount: number | null, rank = 1) => ({
  name: "C", rank, rating, reviewsCount, website: null, category: null,
});

function lead(over: Partial<MapsLead> = {}): MapsLead {
  return {
    name: "Dupont", activity: "plombier", city: "Lyon", phone: "0400000000", website: "https://d.fr",
    rating: 4.8, reviewsCount: 120, recentReviews: [], mapsUrl: "", placeId: null,
    mapsRank: 1, competitors: [comp(4.5, 80), comp(4.3, 60)], ...over,
  };
}
const seo = (over: Partial<SeoOnPage> = {}): SeoOnPage => ({
  title: "t", metaDescription: "d", h1: "h", hasLocalBusinessSchema: true, phones: [], hasTelLink: true,
  activityInTitleOrH1: true, cityInTitleOrH1: true, phoneMatchesListing: true, ...over,
});
function insp(over: Partial<SiteInspection> = {}): SiteInspection {
  return {
    url: "https://d.fr", loadTimeMs: 1000, isResponsive: true, dominantColors: [], logoUrl: null, screenshot: null,
    isHttps: true, seo: seo(), trackersFound: ["Google Analytics"], cmpDetected: "Axeptio",
    paidAdsDetected: ["Google Ads (Conversion AW-)", "Meta Ads (Facebook Pixel)"],
    contactForm: { url: "u", fields: [], captcha: null, hasConsentCheckbox: true, provider: null }, ...over,
  };
}
const px = (pixels: string[] | null): CompetitorPixels => ({ name: "C", rank: 1, website: "x", pixels });
const ids = (l: { id: string }[]) => l.map((c) => c.id);
const get = (r: { criteria: { id: string; max: number; earned: number | null }[] }, id: string) => r.criteria.find((c) => c.id === id);

describe("visibilityScore", () => {
  it("tout mesuré parfait → 100", () => {
    const r = visibilityScore(lead(), insp());
    assert.equal(r.score, 100);
    assert.equal(r.removed.length, 0);
    assert.equal(r.criteria.reduce((s, c) => s + c.max, 0), 100);
  });
  it("sans site : site 0/25, site relié retiré, score ≤ 75", () => {
    const r = visibilityScore(lead({ website: null }), null);
    assert.equal(get(r, "site")?.earned, 0);
    assert.equal(get(r, "site")?.max, 25);
    assert.ok(ids(r.removed).includes("listing_site"));
    assert.ok(r.score <= 75);
  });
  it("sans mapsRank : position retirée, score ramené sur 100", () => {
    const r = visibilityScore(lead({ mapsRank: undefined }), insp());
    assert.ok(ids(r.removed).includes("position"));
    assert.equal(r.score, 100);
  });
  it("rang 4 → 25/35", () => {
    const c = get(visibilityScore(lead({ mapsRank: 4 }), insp()), "position");
    assert.equal(c?.earned, 25);
    assert.equal(c?.max, 35);
  });
  it("rangs 6 et 11", () => {
    assert.equal(get(visibilityScore(lead({ mapsRank: 6 }), insp()), "position")?.earned, 12);
    assert.equal(get(visibilityScore(lead({ mapsRank: 11 }), insp()), "position")?.earned, 0);
  });
  it("sans concurrent : seuils absolus", () => {
    const r = visibilityScore(lead({ competitors: [], rating: 4.2, reviewsCount: 25 }), insp());
    assert.equal(get(r, "rating")?.earned, 8);
    assert.equal(get(r, "reviews_count")?.earned, 8);
    const r2 = visibilityScore(lead({ competitors: [], rating: 4.6, reviewsCount: 50 }), insp());
    assert.equal(get(r2, "rating")?.earned, 15);
    assert.equal(get(r2, "reviews_count")?.earned, 15);
  });
  it("avec concurrents : relatif à la moyenne", () => {
    const r = visibilityScore(lead({ rating: 4.2, reviewsCount: 40 }), insp()); // moy 4.4 / 70
    assert.equal(get(r, "rating")?.earned, 8);
    assert.equal(get(r, "reviews_count")?.earned, 8);
    const r2 = visibilityScore(lead({ rating: 3.5, reviewsCount: 10 }), insp());
    assert.equal(get(r2, "rating")?.earned, 0);
    assert.equal(get(r2, "reviews_count")?.earned, 0);
  });
  it("aucun avis → 0", () => {
    const r = visibilityScore(lead({ rating: null, reviewsCount: null }), insp());
    assert.equal(get(r, "rating")?.earned, 0);
    assert.equal(get(r, "reviews_count")?.earned, 0);
  });
  it("critères du site non mesurés retirés", () => {
    const r = visibilityScore(lead(), insp({ seo: undefined, isResponsive: null, loadTimeMs: null }));
    for (const id of ["site_keywords", "site_description", "site_phone", "site_schema", "site_mobile", "site_speed"]) {
      assert.ok(ids(r.removed).includes(id), id);
    }
  });
  it("métier seul dans le titre → 3/7", () => {
    const r = visibilityScore(lead(), insp({ seo: seo({ cityInTitleOrH1: false }) }));
    assert.equal(get(r, "site_keywords")?.earned, 3);
  });
});

describe("acquisitionScore", () => {
  it("tout parfait → 100", () => {
    const r = acquisitionScore(insp(), [px(["Google Ads (Conversion AW-)"])]);
    assert.equal(r.score, 100);
    assert.equal(r.removed.length, 0);
  });
  it("concurrents tous pixels null → comparaison retirée", () => {
    const r = acquisitionScore(insp(), [px(null), px(null)]);
    assert.ok(ids(r.removed).includes("competitors"));
    assert.equal(r.score, 100);
  });
  it("comparaison : n < m → 10 ; n = 0, m = 0 → 20", () => {
    const three = ["a", "b", "c"];
    const r = acquisitionScore(insp({ paidAdsDetected: ["Meta Ads (Facebook Pixel)"] }), [px(three)]);
    assert.equal(get(r, "competitors")?.earned, 10);
    const r2 = acquisitionScore(insp({ paidAdsDetected: [] }), [px([])]);
    assert.equal(get(r2, "competitors")?.earned, 20);
    const r3 = acquisitionScore(insp({ paidAdsDetected: [] }), [px(["a"])]);
    assert.equal(get(r3, "competitors")?.earned, 0);
  });
  it("inspection absente → suivi et page d'arrivée retirés", () => {
    const r = acquisitionScore(null, [px(["a"])]);
    assert.equal(r.score, 0);
    assert.ok(ids(r.removed).includes("google_ads"));
    assert.ok(ids(r.removed).includes("tel_link"));
  });
  it("suivi : analytics, consentement, formulaire", () => {
    const r = acquisitionScore(insp({ trackersFound: ["Google Tag Manager"], cmpDetected: null, contactForm: null }), []);
    assert.equal(get(r, "analytics")?.earned, 10);
    assert.equal(get(r, "consent")?.earned, 0);
    assert.equal(get(r, "contact_form")?.earned, 0);
    const r2 = acquisitionScore(insp({ trackersFound: undefined, cmpDetected: undefined, contactForm: undefined }), []);
    assert.deepEqual(ids(r2.removed).sort(), ["analytics", "competitors", "consent", "contact_form"]);
  });
});

describe("scoreActions", () => {
  it("au plus 3, aucun pour un critère au maximum, plus grosses pertes d'abord", () => {
    const r = visibilityScore(
      lead({ mapsRank: 20, rating: 3, reviewsCount: 1 }),
      insp({ seo: seo({ activityInTitleOrH1: false, cityInTitleOrH1: false }) }),
    );
    const a = scoreActions(r);
    assert.equal(a.length, 3);
    assert.equal(a[0], scoreActions({ score: 0, removed: [], criteria: [{ id: "position", label: "", max: 35, earned: 0 }] })[0]);
    assert.equal(scoreActions(r, 1).length, 1);
  });
  it("rien quand tout est au maximum", () => {
    assert.deepEqual(scoreActions(visibilityScore(lead(), insp())), []);
  });
  it("ignore les critères retirés", () => {
    assert.deepEqual(scoreActions({ score: 0, removed: [], criteria: [{ id: "position", label: "", max: 35, earned: null }] }), []);
  });
});
