/** Preuves déterministes des bilans en mode préparation : pièces de dossier, constats mesurés, consignes. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getOpportunityOrDefault } from "../../../shared/opportunities";
import { SCAN_MODULE_IDS } from "../../../shared/opportunities";
import { buildBilanQueueFiles, prepBattlecardHeader, prepPitchInput } from "../queueReports";
import { buildPitchPrompt } from "../workflow/pitchPrompt";
import { pitchInputFromDossier, type Dossier } from "../workflow/runner";
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

describe("queueReports — autres offres", () => {
  it("ne produit rien pour une offre qui n'est pas un bilan", async () => {
    const files = await buildBilanQueueFiles({ def: getOpportunityOrDefault("website"), lead, inspection: null, leadId: "x", remoteAppUrl: APP });
    assert.equal(files, null);
  });
});

describe("queueReports — consigne de préparation", () => {
  const seo = getOpportunityOrDefault("seo_local");
  const audit = { score: 62, weaknesses: ["Fiche Google peu fournie", "Site sans balisage local"] };
  const dossier = (def: typeof seo): Dossier => ({
    def, lead, leadId: "l1", demoUrl: `${APP}/demos/l1`, keys: new Set(), inspection: null, sirene: null, qualification: null,
    primaryChannel: "phone", audit: null, demoHtml: null, siteDemoHtml: null, competitorPixels: null, flyerPdf: null, battlecard: null,
    usage: [], trace: SCAN_MODULE_IDS.map((m) => ({ node: m, wave: 1, status: "done" as const, ms: 0 })),
  });

  it("même consigne que le mode complet pour le même bilan (appel, message écrit, formulaire de contact)", async () => {
    const bilan = await buildBilanQueueFiles({ def: seo, lead, inspection: null, leadId: "l1", remoteAppUrl: APP });
    assert.ok(bilan);
    const facts = bilan.auditFacts as { score: { score: number }; weaknesses: string[] };
    const cases = [["phone", "llm_phone_battlecard"], ["email", "llm_cold_email"], ["contact_form", "llm_cold_email"]] as const;
    for (const [channel, generator] of cases) {
      const d = { ...dossier(seo), primaryChannel: channel };
      const full = { ...d, audit: { summary: "", weaknesses: facts.weaknesses, score: facts.score.score } };
      assert.equal(
        buildPitchPrompt(prepPitchInput(d, bilan, APP), generator),
        buildPitchPrompt(pitchInputFromDossier(full, APP), generator),
        channel,
      );
    }
  });

  it("angle demandé en ligne de commande : prioritaire sur celui de la définition", () => {
    const d = dossier(seo);
    const out = buildPitchPrompt(prepPitchInput(d, null, APP, "angle demandé ce jour"), "llm_cold_email");
    assert.ok(out.includes("angle demandé ce jour"));
    assert.ok(!out.includes(seo.commercial.pitchFocus));
    assert.ok(buildPitchPrompt(prepPitchInput(d, null, APP), "llm_cold_email").includes(seo.commercial.pitchFocus));
  });

  it("angle fait d'espaces : l'angle de la définition est conservé", () => {
    const d = dossier(seo);
    assert.ok(buildPitchPrompt(prepPitchInput(d, null, APP, "   "), "llm_cold_email").includes(seo.commercial.pitchFocus));
    assert.ok(buildPitchPrompt(prepPitchInput(d, null, APP, "  angle  "), "llm_cold_email").includes("angle"));
  });

  it("démo de site : pas de bilan dans l'entrée", () => {
    const p = prepPitchInput(dossier(getOpportunityOrDefault("website_redesign")), null, APP);
    assert.equal(p.report, null);
    assert.equal(p.competitorPixels, null);
    assert.equal(p.siteDemoUrl, null);
  });

  it("bilan : score et actions du bilan préparé", () => {
    const bilan = { demoHtml: "", auditFacts: { score: { score: audit.score }, weaknesses: audit.weaknesses }, siteDemoUrl: `${APP}/demos/l1/site`, competitorPixels: null };
    const p = prepPitchInput(dossier(seo), bilan, APP);
    assert.deepEqual(p.report, { score: 62, actions: audit.weaknesses });
    assert.equal(p.siteDemoUrl, `${APP}/demos/l1/site`);
  });
});

describe("queueReports — en-tête du prompt_battlecard.md", () => {
  it("preuve bilan : rappelle que demo.html est déjà écrit et ne doit pas être réécrit", () => {
    const h = prepBattlecardHeader("queue/pending/x", "visibility_report");
    assert.ok(h.includes("queue/pending/x/battlecard.json"));
    assert.ok(h.includes("`demo.html` (le bilan de visibilité locale) est déjà écrit : ne le réécris pas."), h);
    assert.ok(prepBattlecardHeader("d", "acquisition_report").includes("le bilan d'acquisition"));
  });
  it("hors bilan : aucune règle sur demo.html", () => {
    assert.doesNotMatch(prepBattlecardHeader("d", null), /demo\.html|réécris/);
  });
});
