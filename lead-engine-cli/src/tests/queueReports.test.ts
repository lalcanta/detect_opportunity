/** Preuves déterministes des bilans en mode préparation : pièces de dossier, constats mesurés, consignes. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getOpportunityOrDefault } from "../../../shared/opportunities";
import { buildBilanQueueFiles, bilanBattlecardRules } from "../queueReports";
import type { MapsLead, SiteInspection } from "../types";

const lead: MapsLead = {
  name: "Plomberie Martin",
  activity: "Plombier",
  city: "Lyon",
  phone: "04 78 00 00 00",
  website: null,
  rating: 4.6,
  reviewsCount: 12,
  recentReviews: [],
  mapsUrl: "https://maps.google.com/?cid=1",
  placeId: null,
  mapsRank: 4,
  mapsQuery: "plombier Lyon",
  mapsCheckedAt: "2026-11-13T09:00:00.000Z",
  competitors: [{ name: "Plomberie Durand", rank: 1, rating: 4.8, reviewsCount: 90, website: "https://durand.fr", category: "Plombier" }],
};
const APP = "https://app.test";

describe("queueReports — bilan de visibilité", () => {
  const def = getOpportunityOrDefault("seo_local");

  it("écrit le bilan et les constats mesurés, et demande la démo de site quand le prospect n'a pas de site", async () => {
    const files = await buildBilanQueueFiles({ def, lead, inspection: null, leadId: "l1", remoteAppUrl: APP });
    assert.ok(files);
    assert.match(files.demoHtml, /<!DOCTYPE html>/i);
    assert.equal(files.siteDemoUrl, "https://app.test/demos/l1/site");
    assert.ok(files.demoHtml.includes("https://app.test/demos/l1/site"));
    const f = files.auditFacts as Record<string, any>;
    assert.equal(f.kind, "visibility_report");
    assert.equal(f.maps.rank, 4);
    assert.equal(f.maps.query, "plombier Lyon");
    assert.equal(f.maps.checkedAt, "2026-11-13T09:00:00.000Z");
    assert.equal(f.score.score <= 75, true);
    assert.ok(Array.isArray(f.score.criteria) && Array.isArray(f.score.removed));
    assert.equal(f.competitors[0].name, "Plomberie Durand");
    assert.equal(f.competitorPixels, undefined);
    assert.ok(f.actions.length <= 3);
    assert.equal(typeof f.auditSummary, "string");
    assert.deepEqual(f.weaknesses, f.actions);
  });

  it("ne demande pas de démo de site quand le site est correct (complementDemo auto)", async () => {
    const inspection = {
      loadTimeMs: 900,
      isResponsive: true,
      seo: { title: "Plombier à Lyon", h1: "Plombier Lyon", activityInTitleOrH1: true, cityInTitleOrH1: true, hasTelLink: true, phones: [] },
    } as unknown as SiteInspection;
    const files = await buildBilanQueueFiles({ def, lead: { ...lead, website: "https://x.fr" }, inspection, leadId: "l2", remoteAppUrl: APP });
    assert.ok(files);
    assert.equal(files.siteDemoUrl, null);
  });
});

describe("queueReports — prospect sans fiche Maps", () => {
  it("les constats et audit_data disent qu'aucune fiche n'a été relevée", async () => {
    const { mapsSeoAuditFields } = await import("../workflow/auditFields");
    const l = { ...lead, noMapsListing: true, mapsRank: null, mapsQuery: null, competitors: [], website: "https://x.fr" };
    const files = await buildBilanQueueFiles({ def: getOpportunityOrDefault("seo_local"), lead: l, inspection: null, leadId: "d1", remoteAppUrl: APP });
    assert.equal((files!.auditFacts as Record<string, any>).maps.noMapsListing, true);
    assert.equal(mapsSeoAuditFields(l, null, null).no_maps_listing, true);
    assert.equal(mapsSeoAuditFields(lead, null, null).no_maps_listing, false);
  });
});

describe("queueReports — bilan d'acquisition", () => {
  const def = getOpportunityOrDefault("ads_acquisition");

  it("reprend les pixels des concurrents (non vérifié = null) dans les constats", async () => {
    const fetcher = (async () => {
      throw new Error("réseau");
    }) as unknown as typeof fetch;
    const files = await buildBilanQueueFiles({ def, lead, inspection: null, leadId: "a1", remoteAppUrl: APP, fetcher });
    assert.ok(files);
    const f = files.auditFacts as Record<string, any>;
    assert.equal(f.kind, "acquisition_report");
    assert.deepEqual(f.competitorPixels, [{ name: "Plomberie Durand", rank: 1, website: "https://durand.fr", pixels: null }]);
  });
});

describe("queueReports — autres offres et consigne de battlecard", () => {
  it("ne produit rien pour une offre qui n'est pas un bilan", async () => {
    const files = await buildBilanQueueFiles({ def: getOpportunityOrDefault("website"), lead, inspection: null, leadId: "x", remoteAppUrl: APP });
    assert.equal(files, null);
  });

  it("limite la battlecard aux constats mesurés et mentionne la refonte seulement si la démo est demandée", () => {
    const without = bilanBattlecardRules({ siteDemoUrl: null });
    assert.match(without, /audit_facts\.json/);
    assert.match(without, /abonnement/i);
    assert.doesNotMatch(without, /refonte/i);
    const withDemo = bilanBattlecardRules({ siteDemoUrl: "https://app.test/demos/l1/site" });
    assert.match(withDemo, /refonte/i);
    assert.match(withDemo, /https:\/\/app\.test\/demos\/l1\/site/);
  });
});
