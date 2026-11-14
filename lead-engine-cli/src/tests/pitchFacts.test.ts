/** Constats apportés par chaque nœud du workflow, et angle de la preuve. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getOpportunityOrDefault, SCAN_MODULE_IDS } from "../../../shared/opportunities";
import { CONSENT_GATED_LABEL } from "../generator/reportScoring";
import type { NodeRun } from "../workflow/runner";
import { pitchFacts, proofAngle, type PitchInput } from "../workflow/pitchFacts";
import type { MapsLead, SiteInspection } from "../types";

const DEMO = "https://app.test/demos/l1";

const baseLead: MapsLead = {
  name: "Plomberie Martin", activity: "Plombier", city: "Lyon", phone: "04 78 00 00 00", website: "https://m.fr",
  rating: 4.6, reviewsCount: 61, recentReviews: [], mapsUrl: "", placeId: null,
  mapsQuery: "plombier Lyon", mapsCheckedAt: "2026-11-13T09:00:00.000Z",
};

const baseInspection: SiteInspection = {
  url: "https://m.fr", loadTimeMs: 1200, isResponsive: true, dominantColors: [], logoUrl: null, screenshot: null,
  seo: {
    title: "Accueil", metaDescription: null, h1: "Bienvenue", hasLocalBusinessSchema: false, phones: [], hasTelLink: true,
    activityInTitleOrH1: false, cityInTitleOrH1: true, phoneMatchesListing: null,
  },
};

const run = (node: string, status: NodeRun["status"] = "done"): NodeRun => ({ node, wave: 1, status, ms: 0 });
const allModulesDone = (): NodeRun[] => SCAN_MODULE_IDS.map((m) => run(m));

function input(over: Partial<PitchInput> = {}): PitchInput {
  return {
    def: getOpportunityOrDefault("website_redesign"),
    lead: baseLead,
    demoUrl: DEMO,
    primaryChannel: "phone",
    inspection: baseInspection,
    sirene: null,
    trace: allModulesDone(),
    report: null,
    competitorPixels: null,
    siteDemoUrl: null,
    ...over,
  };
}

const values = (p: PitchInput): string[] => pitchFacts(p).map((f) => f.value);
const labels = (p: PitchInput): string[] => pitchFacts(p).map((f) => f.label);

describe("fiche Maps", () => {
  it("note et nombre d'avis lus", () => {
    assert.ok(values(input()).some((v) => v.includes("4.6/5") && v.includes("61 avis")));
  });
  it("note et avis non lus : rien n'en parle", () => {
    const vs = values(input({ lead: { ...baseLead, rating: null, reviewsCount: null } }));
    assert.ok(!vs.some((v) => /avis|\/5/.test(v)), vs.join("\n"));
  });
  it("sans fiche Maps : ni note, ni avis, ni rang, ni concurrent", () => {
    const lead: MapsLead = {
      ...baseLead, noMapsListing: true, mapsRank: 3,
      recentReviews: [{ author: "Julie", rating: 5, text: "Très bien", relativeDate: "" }],
      competitors: [{ name: "Durand", rank: 1, rating: 4.8, reviewsCount: 90, website: null, category: null }],
    };
    const facts = pitchFacts(input({ lead, inspection: null }));
    assert.ok(!facts.some((f) => /note|avis|position|concurrent/i.test(f.label)), JSON.stringify(facts));
    assert.ok(!facts.some((f) => /\/5|avis|Durand/.test(f.value)), JSON.stringify(facts));
  });
});

describe("avis cités", () => {
  it("extrait et auteur", () => {
    const lead = { ...baseLead, recentReviews: [{ author: "Julie R.", rating: 5, text: "Intervention rapide et propre.", relativeDate: "" }] };
    assert.ok(values(input({ lead })).some((v) => v.includes("Intervention rapide et propre.") && v.includes("Julie R.")));
  });
  it("au plus deux avis, extrait de 200 caractères au plus", () => {
    const long = "mot ".repeat(100);
    const lead = { ...baseLead, recentReviews: [1, 2, 3].map((n) => ({ author: `A${n}`, rating: 5, text: long, relativeDate: "" })) };
    const reviews = pitchFacts(input({ lead })).filter((f) => f.label === "Avis client");
    assert.equal(reviews.length, 2);
    for (const r of reviews) assert.ok(/^« (.+) » — A\d$/.exec(r.value)![1]!.length <= 200, r.value);
  });
  it("aucun avis lu : aucun fait « Avis »", () => {
    assert.ok(!labels(input()).some((l) => /^Avis/.test(l)));
  });
});

describe("modules du site", () => {
  it("seo_onpage fait : titre cité, métier absent", () => {
    const vs = values(input());
    assert.ok(vs.some((v) => v.includes("Accueil") && /le métier ne figure/.test(v)), vs.join("\n"));
  });
  it("seo_onpage sauté : aucun fait de titre", () => {
    const trace = allModulesDone().map((t) => (t.node === "seo_onpage" ? run("seo_onpage", "skipped") : t));
    const ls = labels(input({ trace }));
    assert.ok(!ls.some((l) => /titre/i.test(l)), ls.join("\n"));
    assert.ok(!values(input({ trace })).some((v) => v.includes("Accueil")));
  });
  it("inspection absente : seuls les constats de la fiche", () => {
    const without = pitchFacts(input({ inspection: null }));
    const listingOnly = pitchFacts(input({ inspection: null, trace: [] }));
    assert.deepEqual(without, listingOnly);
    assert.ok(!without.some((f) => /Titre|HTTPS|Pixels|Affichage|Technologie|Réseaux|Formulaire/.test(f.label)));
  });
  it("ads_pixel_spy : identifiant lu derrière un bandeau, libellé du consentement", () => {
    const inspection: SiteInspection = {
      ...baseInspection, cmpDetected: "Axeptio", htmlTagIds: { analytics: [], googleAds: ["AW-1"], metaPixel: [] },
    };
    const vs = values(input({ inspection, trace: [run("ads_pixel_spy")] }));
    assert.ok(vs.some((v) => v.includes(CONSENT_GATED_LABEL)), vs.join("\n"));
  });
  it("ordre du catalogue : seo_onpage avant ads_pixel_spy", () => {
    const inspection: SiteInspection = { ...baseInspection, paidAdsDetected: ["Meta Ads (Facebook Pixel)"] };
    const trace = [run("ads_pixel_spy"), run("seo_onpage")];
    const ls = labels(input({ inspection, trace }));
    assert.ok(ls.indexOf("Titre de la page") >= 0 && ls.indexOf("Titre de la page") < ls.indexOf("Pixels publicitaires"), ls.join("\n"));
  });
});

describe("bilans", () => {
  const visibility = getOpportunityOrDefault("seo_local");
  const acquisition = getOpportunityOrDefault("ads_acquisition");

  it("pixel d'un concurrent non vérifié : jamais « aucun pixel »", () => {
    const p = input({
      def: acquisition, report: { score: 40, actions: [] },
      competitorPixels: [{ name: "Durand", rank: 1, website: "https://d.fr", pixels: null }],
    });
    const durand = values(p).filter((v) => v.includes("Durand"));
    assert.ok(durand.some((v) => v.includes("non vérifié")), durand.join("\n"));
    assert.ok(!durand.some((v) => /aucun pixel/i.test(v)));
  });
  it("sans fiche Maps : aucun pixel de concurrent cité", () => {
    const p = input({
      def: acquisition, lead: { ...baseLead, noMapsListing: true }, report: { score: 40, actions: [] },
      competitorPixels: [{ name: "Durand", rank: 1, website: "https://d.fr", pixels: ["Meta Ads (Facebook Pixel)"] }],
    });
    const facts = pitchFacts(p);
    assert.ok(!facts.some((f) => /concurrent/i.test(f.label) || f.value.includes("Durand")), JSON.stringify(facts));
  });
  it("score et actions du bilan", () => {
    const vs = values(input({ def: visibility, report: { score: 52, actions: ["Collecter davantage d'avis"] } }));
    assert.ok(vs.some((v) => v.includes("52/100")));
    assert.ok(vs.some((v) => v.includes("Collecter davantage d'avis")));
  });
  it("rang 1 : consolider l'avance, sans manque de visibilité ni appels", () => {
    const lead: MapsLead = {
      ...baseLead, mapsRank: 1,
      competitors: [{ name: "Durand", rank: 2, rating: 4.8, reviewsCount: 40, website: null, category: null }],
    };
    const a = proofAngle(input({ def: visibility, lead }));
    assert.doesNotMatch(a, /manque de visibilité|appels/);
    assert.match(a, /consolider son avance/);
    assert.match(a, /Durand/);
    assert.match(a, /21 avis/);
  });
  it("rang 4 : les concurrents placés devant", () => {
    const lead: MapsLead = {
      ...baseLead, mapsRank: 4,
      competitors: [{ name: "Durand", rank: 1, rating: 4.8, reviewsCount: 90, website: null, category: null }],
    };
    const a = proofAngle(input({ def: visibility, lead }));
    assert.match(a, /devant/);
    assert.match(a, /Durand/);
  });
  it("rang non mesuré : ne parle pas de position", () => {
    assert.doesNotMatch(proofAngle(input({ def: visibility })), /position/i);
  });
  it("démo complémentaire produite : son lien est un constat", () => {
    const url = `${DEMO}/site`;
    assert.ok(values(input({ def: visibility, siteDemoUrl: url })).some((v) => v.includes(url)));
  });
  it("démo complémentaire : complément éventuel, le bilan reste le lien principal, pas une maquette", () => {
    const a = proofAngle(input({ def: visibility, siteDemoUrl: `${DEMO}/site` }));
    assert.match(a, /complément éventuel/);
    assert.match(a, /le lien principal reste le bilan/);
    assert.match(a, /pas une maquette de site/);
  });
  it("acquisition : l'angle ne parle jamais de visibilité", () => {
    assert.doesNotMatch(proofAngle(input({ def: acquisition })), /visibilit/i);
  });
  it("sans démo complémentaire : interdit de proposer un nouveau site", () => {
    assert.match(proofAngle(input({ def: acquisition })), /ne propose pas de nouveau site/);
  });
});

describe("angle de la démo de site", () => {
  it("présente la maquette préparée", () => {
    assert.match(proofAngle(input()), /maquette de site préparée/);
  });
  it("lien principal cité", () => {
    assert.ok(values(input()).includes(DEMO));
  });
});
