/** Démo de site complémentaire d'un bilan : condition `auto`, nœud `site_demo` et données synchronisées. */
import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { BrowserContext } from "playwright";
import { getOpportunityOrDefault, type OpportunityDefinition } from "../../../shared/opportunities";
import { PITCH_GENERATORS, PROOF_GENERATORS, type GenerationContext } from "../opportunities/generators";
import { needsSiteDemo } from "../opportunities/siteDemo";
import { buildSyncPayload, runLeadWorkflow } from "../workflow/runner";
import type { ModelRouter } from "../llm/modelRouter";
import type { MapsLead, SeoOnPage, SiteInspection } from "../types";

const seo = getOpportunityOrDefault("seo_local");
const ads = getOpportunityOrDefault("ads_acquisition");
const withMode = (def: OpportunityDefinition, complementDemo: OpportunityDefinition["complementDemo"]): OpportunityDefinition => ({ ...def, complementDemo });

const lead = (over: Partial<MapsLead> = {}): MapsLead => ({
  name: "Plomberie Martin",
  activity: "Plombier",
  city: "Lyon",
  phone: "04 78 00 00 00",
  website: "https://plomberie-martin.fr",
  rating: 4.6,
  reviewsCount: 12,
  recentReviews: [],
  mapsUrl: "https://maps.google.com/?cid=1",
  placeId: null,
  mapsRank: 4,
  mapsQuery: "plombier Lyon",
  mapsCheckedAt: "2026-11-13T09:00:00.000Z",
  competitors: [{ name: "Plomberie Durand", rank: 1, rating: 4.8, reviewsCount: 90, website: null, category: "Plombier" }],
  ...over,
});

const seoOk = (over: Partial<SeoOnPage> = {}): SeoOnPage => ({
  title: "Plombier à Lyon",
  metaDescription: "Dépannage",
  h1: "Plombier Lyon",
  hasLocalBusinessSchema: true,
  phones: ["0478000000"],
  hasTelLink: true,
  activityInTitleOrH1: true,
  cityInTitleOrH1: true,
  phoneMatchesListing: true,
  ...over,
});

/** Site sans défaut mesuré : aucune condition de la démo n'est vraie. */
const goodSite = (over: Partial<SiteInspection> = {}): SiteInspection => ({
  url: "https://plomberie-martin.fr",
  loadTimeMs: 1200,
  isResponsive: true,
  dominantColors: [],
  logoUrl: null,
  screenshot: null,
  seo: seoOk(),
  contactForm: null,
  ...over,
});

describe("needsSiteDemo — visibilité locale", () => {
  it("site sans défaut : pas de démo", () => {
    assert.equal(needsSiteDemo(seo, lead(), goodSite()), false);
  });
  it("prospect sans site : démo", () => {
    assert.equal(needsSiteDemo(seo, lead({ website: null }), null), true);
  });
  it("site non adapté au mobile : démo", () => {
    assert.equal(needsSiteDemo(seo, lead(), goodSite({ isResponsive: false })), true);
  });
  it("chargement au-delà de 3 s : démo ; 3 s pile : pas de démo", () => {
    assert.equal(needsSiteDemo(seo, lead(), goodSite({ loadTimeMs: 3001 })), true);
    assert.equal(needsSiteDemo(seo, lead(), goodSite({ loadTimeMs: 3000 })), false);
  });
  it("métier ou ville absent du titre et du H1 : démo ; les deux présents : pas de démo", () => {
    assert.equal(needsSiteDemo(seo, lead(), goodSite({ seo: seoOk({ activityInTitleOrH1: false, cityInTitleOrH1: false }) })), true);
    assert.equal(needsSiteDemo(seo, lead(), goodSite({ seo: seoOk({ activityInTitleOrH1: false }) })), true);
    assert.equal(needsSiteDemo(seo, lead(), goodSite({ seo: seoOk({ cityInTitleOrH1: false }) })), true);
    assert.equal(needsSiteDemo(seo, lead(), goodSite({ seo: seoOk() })), false);
  });
  it("mesure absente : pas de démo sur un critère non mesuré", () => {
    assert.equal(needsSiteDemo(seo, lead(), goodSite({ isResponsive: null, loadTimeMs: null, seo: undefined })), false);
    assert.equal(needsSiteDemo(seo, lead(), null), false);
  });
});

describe("needsSiteDemo — prospect sans fiche Maps", () => {
  it("métier et ville inventés (scan par domaines) : pas de démo sur les mots-clés", () => {
    const l = lead({ noMapsListing: true, activity: "Agence / Digital", city: "France", mapsRank: null, mapsQuery: null });
    assert.equal(needsSiteDemo(seo, l, goodSite({ seo: seoOk({ activityInTitleOrH1: false, cityInTitleOrH1: false }) })), false);
    assert.equal(needsSiteDemo(seo, l, goodSite({ isResponsive: false })), true);
  });
});

describe("needsSiteDemo — acquisition", () => {
  it("site sans défaut : pas de démo", () => {
    assert.equal(needsSiteDemo(ads, lead(), goodSite()), false);
  });
  it("ni lien tel: ni formulaire : démo", () => {
    assert.equal(needsSiteDemo(ads, lead(), goodSite({ seo: seoOk({ hasTelLink: false }), contactForm: null })), true);
  });
  it("formulaire non cherché ou lien tel: non mesuré : critère ignoré", () => {
    assert.equal(needsSiteDemo(ads, lead(), goodSite({ seo: seoOk({ hasTelLink: false }), contactForm: undefined })), false);
    assert.equal(needsSiteDemo(ads, lead(), goodSite({ seo: undefined, contactForm: null })), false);
  });
  it("un formulaire sans lien tel: : pas de démo", () => {
    const form = { url: "https://plomberie-martin.fr/contact", fields: ["email"], captcha: null, hasConsentCheckbox: false, provider: null };
    assert.equal(needsSiteDemo(ads, lead(), goodSite({ seo: seoOk({ hasTelLink: false }), contactForm: form })), false);
  });
  it("mobile ou lenteur : démo", () => {
    assert.equal(needsSiteDemo(ads, lead(), goodSite({ isResponsive: false })), true);
    assert.equal(needsSiteDemo(ads, lead(), goodSite({ loadTimeMs: 4500 })), true);
  });
  it("le titre sans métier ni ville ne compte pas pour l'acquisition", () => {
    assert.equal(needsSiteDemo(ads, lead(), goodSite({ seo: seoOk({ activityInTitleOrH1: false, cityInTitleOrH1: false }) })), false);
  });
});

describe("needsSiteDemo — réglage du besoin", () => {
  it("always : toujours ; never : jamais", () => {
    assert.equal(needsSiteDemo(withMode(seo, "always"), lead(), goodSite()), true);
    assert.equal(needsSiteDemo(withMode(seo, "never"), lead({ website: null }), null), false);
    assert.equal(needsSiteDemo(withMode(ads, "never"), lead(), goodSite({ isResponsive: false })), false);
  });
  it("une preuve qui n'est pas un bilan n'a pas de démo complémentaire", () => {
    assert.equal(needsSiteDemo(withMode(getOpportunityOrDefault("website"), "always"), lead({ website: null }), null), false);
  });
});

describe("nœud site_demo", () => {
  const realFetch = globalThis.fetch;
  const realLlmDemo = PROOF_GENERATORS.llm_demo;
  const realBattlecard = PITCH_GENERATORS.llm_phone_battlecard;
  afterEach(() => {
    globalThis.fetch = realFetch;
    PROOF_GENERATORS.llm_demo = realLlmDemo;
    PITCH_GENERATORS.llm_phone_battlecard = realBattlecard;
  });

  /** Aucun appel réseau réel : SIRENE répond vide, les générateurs LLM sont remplacés. */
  function stubAll(): { demoCalls: GenerationContext[] } {
    const state = { demoCalls: [] as GenerationContext[] };
    globalThis.fetch = (async () => new Response(JSON.stringify({ results: [] }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
    PROOF_GENERATORS.llm_demo = async (ctx) => {
      state.demoCalls.push(ctx);
      return { audit: { summary: "démo", weaknesses: [], score: 10 }, demoHtml: "<html>démo de site</html>" };
    };
    PITCH_GENERATORS.llm_phone_battlecard = async () => ({ callScript: "Bonjour" });
    return state;
  }

  const full = { mode: "full" as const, context: {} as BrowserContext, remoteAppUrl: "https://crm.test", router: {} as ModelRouter };
  const prep = { mode: "prep" as const, context: {} as BrowserContext, remoteAppUrl: "https://crm.test" };
  const input = (def: OpportunityDefinition, l: MapsLead) => ({ def, lead: l, leadId: "pm", demoUrl: "https://crm.test/demos/pm" });

  it("en mode prep, la démo est laissée à la file locale", async () => {
    stubAll();
    const d = await runLeadWorkflow(input(seo, lead({ website: null })), prep);
    const run = d.trace.find((t) => t.node === "site_demo");
    assert.equal(run?.status, "skipped");
    assert.equal(run?.note, "écrite par la file locale");
  });

  it("prospect sans site : bilan avec lien vers la démo, puis démo d'angle référencement local", async () => {
    const state = stubAll();
    const d = await runLeadWorkflow(input(seo, lead({ website: null })), full);
    const proofRun = d.trace.find((t) => t.node === "visibility_report")!;
    const demoRun = d.trace.find((t) => t.node === "site_demo")!;
    assert.equal(proofRun.status, "done");
    assert.equal(demoRun.status, "done");
    assert.ok(proofRun.wave < demoRun.wave);
    assert.match(d.demoHtml ?? "", /https:\/\/crm\.test\/demos\/pm\/site/);
    assert.equal(d.siteDemoHtml, "<html>démo de site</html>");
    assert.equal(state.demoCalls.length, 1);
    const proof = state.demoCalls[0]!.def.proof;
    assert.ok(proof.kind === "demo_web" && proof.focus === "seo_local");
    // Le bilan reste la preuve principale : son audit n'est pas remplacé par celui de la démo.
    assert.notEqual(d.audit?.summary, "démo");
    const payload = buildSyncPayload(d);
    assert.equal(payload.site_demo_html, "<html>démo de site</html>");
    assert.equal(payload.audit_data.maps_rank, 4);
    assert.equal(payload.audit_data.maps_query, "plombier Lyon");
    assert.equal(payload.audit_data.maps_checked_at, "2026-11-13T09:00:00.000Z");
    assert.equal((payload.audit_data.competitors as unknown[]).length, 1);
  });

  it("never : bilan sans lien, démo passée « site non en cause »", async () => {
    const state = stubAll();
    const d = await runLeadWorkflow(input(withMode(seo, "never"), lead({ website: null })), full);
    const demoRun = d.trace.find((t) => t.node === "site_demo")!;
    assert.equal(demoRun.status, "skipped");
    assert.equal(demoRun.note, "site non en cause");
    assert.doesNotMatch(d.demoHtml ?? "", /\/demos\/pm\/site/);
    assert.equal(d.siteDemoHtml, null);
    assert.equal(state.demoCalls.length, 0);
    assert.equal(buildSyncPayload(d).site_demo_html, null);
  });

  it("un échec de la démo fait échouer le lead (pas de synchronisation à moitié)", async () => {
    stubAll();
    PROOF_GENERATORS.llm_demo = async () => {
      throw new Error("modèle indisponible");
    };
    await assert.rejects(runLeadWorkflow(input(seo, lead({ website: null })), full), /modèle indisponible/);
  });
});
