import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildQueueBattlecard, pruneManifest, queueGenerationUsage, syncQueue, type SyncQueueResult } from "../syncQueue";
import type { SyncPayload } from "../types";

const APP = "https://app.test";

describe("syncQueue — assemblage battlecard (audit 1.6)", () => {
  const qaMeta = { id: "abc123", company_name: "Agence Pixel", opportunity_type: "audit_qa_trackers" };

  it("doit attendre l'agent tant qu'un lead QA n'a pas de cold email", () => {
    const res = buildQueueBattlecard(qaMeta, { auditSummary: "2 traceurs", objections: [] }, null, APP);
    assert.ok("waiting" in res);
  });

  it("doit pousser un lead QA complet sans textes prévus pour un site web", () => {
    const res = buildQueueBattlecard(
      qaMeta,
      { coldEmail: { subject: "[Dev QA] test", body: "Hello" } },
      { auditSummary: "1 traceur(s) tiers exécuté(s) avant consentement (GA4).", weaknesses: ["GA4 déclenché avant consentement CMP"] },
      APP,
    );
    assert.ok(!("waiting" in res));
    assert.equal(res.battlecard.coldEmail?.subject, "[Dev QA] test");
    assert.equal(res.battlecard.whatsappText, "");
    assert.ok(!res.battlecard.ourAdvantages?.some((a) => /barre d'appel/i.test(a)));
    assert.deepEqual(res.weaknesses, ["GA4 déclenché avant consentement CMP"], "Les constats mesurés doivent être repris");
    assert.match(res.summary, /GA4/);
  });

  it("doit garder les valeurs par défaut site web pour un lead website sans cold email", () => {
    const res = buildQueueBattlecard({ id: "w1", company_name: "Plombier Dupont" }, { openingPitch: "Bonjour" }, null, APP);
    assert.ok(!("waiting" in res));
    assert.equal(res.battlecard.callScript, "Bonjour");
    assert.match(res.battlecard.whatsappText ?? "", /https:\/\/app\.test\/demos\/w1/);
  });
});

describe("syncQueue — aucune faiblesse inventée (démo de site préparée en file)", () => {
  const nouveau = { callScript: "Bonjour", objections: [], whatsappText: "" };
  const meta = { id: "w2", company_name: "Plombier Dupont", opportunity_type: "website_redesign" };

  it("meta.json sans mesure : aucune faiblesse et un résumé sans affirmation", () => {
    const res = buildQueueBattlecard(meta, nouveau, null, APP);
    assert.ok(!("waiting" in res));
    assert.deepEqual(res.weaknesses, []);
    assert.doesNotMatch(res.summary, /lent|smartphone|performance|barre d'appel|avis/i);
  });

  it("signal mesuré dans meta.json : ce signal seulement", () => {
    const res = buildQueueBattlecard(
      { ...meta, isResponsive: false, obsolescence_signals: ["Site non mis à jour depuis 2018"] },
      nouveau, null, APP,
    );
    assert.ok(!("waiting" in res));
    assert.equal(res.weaknesses.length, 2);
    assert.ok(res.weaknesses.includes("Site non mis à jour depuis 2018"));
    assert.ok(res.weaknesses.some((w) => /téléphone/i.test(w)));
  });

  it("isResponsive vrai ou nul : pas de faiblesse d'affichage", () => {
    assert.deepEqual((buildQueueBattlecard({ ...meta, isResponsive: true }, nouveau, null, APP) as { weaknesses: string[] }).weaknesses, []);
  });

  it("les anciens champs restent lus pour les dossiers déjà en file", () => {
    const res = buildQueueBattlecard(meta, { ...nouveau, currentSiteCritique: ["Ancien constat"] }, null, APP);
    assert.ok(!("waiting" in res));
    assert.deepEqual(res.weaknesses, ["Ancien constat"]);
  });
});

describe("syncQueue — secours sans mesure inventée (battlecard absente)", () => {
  const empty = { callScript: "Bonjour", objections: [] };
  const url = "https://app.test/demos/s1";
  const fallback = (meta: { opportunity_type?: string }, facts: { kind?: string } | null = null) =>
    (buildQueueBattlecard({ id: "s1", company_name: "Plombier Dupont", ...meta }, empty, facts, APP) as { battlecard: { ourAdvantages?: string[]; whatsappText?: string } }).battlecard;

  it("aucun avantage inventé : liste vide quand l'agent n'en a pas écrit", () => {
    assert.deepEqual(fallback({ opportunity_type: "website_redesign" }).ourAdvantages, []);
    assert.deepEqual(fallback({}).ourAdvantages, []);
  });
  it("secours WhatsApp d'une démo de site : nomme la démo, avec le lien, sans mesure", () => {
    const w = fallback({ opportunity_type: "website_redesign" }).whatsappText ?? "";
    assert.ok(w.includes(url) && /démo/i.test(w), w);
    assert.doesNotMatch(w.replace(url, ""), /futur site|\d/);
  });
  it("secours WhatsApp d'un bilan de visibilité : nomme le bilan, jamais une démo de site", () => {
    const w = fallback({ opportunity_type: "seo_local" }).whatsappText ?? "";
    assert.ok(w.includes(url) && w.includes("bilan de visibilité locale"), w);
    assert.doesNotMatch(w, /démo|futur site/i);
  });
  it("secours WhatsApp d'un bilan d'acquisition : nomme le bilan", () => {
    const w = fallback({ opportunity_type: "ads_acquisition" }).whatsappText ?? "";
    assert.ok(w.includes(url) && w.includes("bilan d'acquisition"), w);
  });
  it("audit_facts.kind prime sur le type d'opportunité", () => {
    const w = fallback({ opportunity_type: "website_redesign" }, { kind: "visibility_report" }).whatsappText ?? "";
    assert.ok(w.includes("bilan de visibilité locale"), w);
  });
});

describe("syncQueue — purge du manifeste (audit 1.7)", () => {
  it("doit retirer les leads dont le dossier n'est plus dans pending", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "lead-queue-"));
    const still = path.join(root, "pending", "still");
    await mkdir(still, { recursive: true });
    const manifest = path.join(root, "pending_manifest.json");
    await writeFile(manifest, JSON.stringify([{ id: "still", dir: still }, { id: "gone", dir: path.join(root, "pending", "gone") }]));

    await pruneManifest(manifest);

    const list = JSON.parse(await readFile(manifest, "utf-8")) as { id: string }[];
    assert.deepEqual(list.map((l) => l.id), ["still"]);
  });
});

describe("syncQueue — provenance des leads générés par un agent", () => {
  it("trace l'agent pour la démo et la battlecard, le générateur déterministe pour le rapport QA", () => {
    assert.deepEqual(queueGenerationUsage({ opportunity_type: "website" }, "claude-code").map((u) => u.model), ["agent:claude-code", "agent:claude-code"]);
    assert.deepEqual(queueGenerationUsage({ opportunity_type: "audit_qa_trackers" }, "antigravity").map((u) => u.model), ["deterministe:tracker_report", "agent:antigravity"]);
    assert.deepEqual(queueGenerationUsage({ opportunity_type: "seo_local" }, "claude-code").map((u) => u.model), ["deterministe:visibility_report", "agent:claude-code"]);
    assert.deepEqual(queueGenerationUsage({ opportunity_type: "ads_acquisition" }, "claude-code").map((u) => u.model), ["deterministe:acquisition_report", "agent:claude-code"]);
    assert.equal(queueGenerationUsage({ opportunity_type: "website" }, undefined)[0]!.model, "agent:inconnu");
  });
});

describe("syncQueue — dossiers de bilan et démo de site complémentaire", () => {
  const mkLead = async (id: string, files: Record<string, string>, opp = "seo_local", channel = "email") => {
    const dir = path.join("queue", "pending", id);
    await mkdir(dir, { recursive: true });
    const meta = { id, company_name: `Entreprise ${id}`, opportunity_type: opp, primary_channel: channel };
    await writeFile(path.join(dir, "meta.json"), JSON.stringify(meta));
    for (const [name, content] of Object.entries(files)) await writeFile(path.join(dir, name), content);
  };
  const BC = JSON.stringify({ coldEmail: { subject: "S", body: "B" } });

  const runSync = async (): Promise<{ result: SyncQueueResult; payloads: SyncPayload[] }> => {
    const root = await mkdtemp(path.join(tmpdir(), "lead-sync-"));
    const prevCwd = process.cwd();
    const prevFetch = globalThis.fetch;
    const prevEnv = { url: process.env.REMOTE_APP_URL, tok: process.env.SYNC_SECRET_TOKEN };
    const payloads: SyncPayload[] = [];
    process.chdir(root);
    process.env.REMOTE_APP_URL = "https://app.test";
    process.env.SYNC_SECRET_TOKEN = "token-de-test-1234";
    globalThis.fetch = (async (_u: unknown, init?: RequestInit) => {
      payloads.push(JSON.parse(String(init?.body)) as SyncPayload);
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    try {
      await (globalThis as { __seed?: () => Promise<void> }).__seed?.();
      return { result: await syncQueue({ quiet: true }), payloads };
    } finally {
      process.chdir(prevCwd);
      globalThis.fetch = prevFetch;
      process.env.REMOTE_APP_URL = prevEnv.url;
      process.env.SYNC_SECRET_TOKEN = prevEnv.tok;
    }
  };

  const withQueue = async (seed: () => Promise<void>) => {
    (globalThis as { __seed?: () => Promise<void> }).__seed = seed;
    try {
      return await runSync();
    } finally {
      delete (globalThis as { __seed?: () => Promise<void> }).__seed;
    }
  };

  it("synchronise un bilan complet sans démo de site demandée, sans site_demo_html", async () => {
    const { result, payloads } = await withQueue(() => mkLead("b1", { "demo.html": "<!DOCTYPE html><p>bilan</p>", "battlecard.json": BC }));
    assert.deepEqual(result.synced, ["b1"]);
    assert.equal(payloads[0]!.site_demo_html ?? null, null);
  });

  it("reprend dans audit_data les données Maps, SEO et concurrents écrites par prep dans meta.json", async () => {
    const fields = { maps_rank: 4, maps_query: "plombier Lyon", maps_checked_at: "2026-11-13T09:00:00.000Z", competitors: [{ name: "C", rank: 1 }], seo: { title: "T" }, competitor_pixels: null };
    const { payloads } = await withQueue(async () => {
      await mkLead("b4", { "demo.html": "<!DOCTYPE html><p>bilan</p>", "battlecard.json": BC });
      const metaPath = path.join("queue", "pending", "b4", "meta.json");
      const meta = JSON.parse(await readFile(metaPath, "utf-8"));
      await writeFile(metaPath, JSON.stringify({ ...meta, audit_fields: fields }));
    });
    const ad = payloads[0]!.audit_data as Record<string, unknown>;
    for (const [k, v] of Object.entries(fields)) assert.deepEqual(ad[k], v, k);
  });

  it("dossier sans bilan : aucun score dans audit_data, même pour un site lent", async () => {
    const { payloads } = await withQueue(async () => {
      await mkLead("s1", { "demo.html": "<!DOCTYPE html><p>démo</p>", "battlecard.json": BC }, "website_redesign");
      const metaPath = path.join("queue", "pending", "s1", "meta.json");
      const meta = JSON.parse(await readFile(metaPath, "utf-8"));
      await writeFile(metaPath, JSON.stringify({ ...meta, loadTimeMs: 6200 }));
    });
    const ad = payloads[0]!.audit_data as Record<string, unknown>;
    assert.equal(ad.score ?? null, null);
  });

  it("dossier bilan : le score du bilan (audit_facts.json) est repris", async () => {
    const { payloads } = await withQueue(async () => {
      await mkLead("s2", { "demo.html": "<!DOCTYPE html><p>bilan</p>", "battlecard.json": BC, "audit_facts.json": JSON.stringify({ kind: "visibility_report", score: { score: 62 } }) });
    });
    assert.equal((payloads[0]!.audit_data as Record<string, unknown>).score, 62);
  });

  it("laisse en attente un bilan dont prompt_site_demo.md n'a pas son site_demo.html, avec la raison", async () => {
    const { result, payloads } = await withQueue(() =>
      mkLead("b2", { "demo.html": "<!DOCTYPE html><p>bilan</p>", "battlecard.json": BC, "prompt_site_demo.md": "consigne" }),
    );
    assert.deepEqual(result.synced, []);
    assert.equal(payloads.length, 0);
    assert.deepEqual(result.waiting, [{ id: "b2", reason: "site_demo.html manquant (consigne : prompt_site_demo.md)" }]);
  });

  it("joint site_demo_html au payload quand prompt_site_demo.md et site_demo.html sont là", async () => {
    const { result, payloads } = await withQueue(() =>
      mkLead("b3", {
        "demo.html": "<!DOCTYPE html><p>bilan</p>",
        "battlecard.json": BC,
        "prompt_site_demo.md": "consigne",
        "site_demo.html": "<!DOCTYPE html><p>site</p>",
      }),
    );
    assert.deepEqual(result.synced, ["b3"]);
    assert.match(payloads[0]!.site_demo_html ?? "", /<p>site<\/p>/);
    assert.match(payloads[0]!.demo_html ?? "", /bilan/);
  });

  it("garde le comportement des offres existantes : démo web et rapport QA sans site_demo_html", async () => {
    const { result, payloads } = await withQueue(async () => {
      await mkLead("w1", { "demo.html": "<!DOCTYPE html><p>demo</p>", "battlecard.json": JSON.stringify({ openingPitch: "Bonjour" }) }, "website", "phone");
      await mkLead("q1", { "demo.html": "<!DOCTYPE html><p>qa</p>", "battlecard.json": BC }, "audit_qa_trackers");
      await mkLead("q2", { "demo.html": "<!DOCTYPE html><p>qa</p>", "battlecard.json": JSON.stringify({ auditSummary: "x" }) }, "audit_qa_trackers");
    });
    assert.deepEqual(result.synced.sort(), ["q1", "w1"]);
    assert.deepEqual(result.waiting, [{ id: "q2", reason: "coldEmail absent de battlecard.json (message écrit attendu)" }]);
    assert.ok(payloads.every((p) => (p.site_demo_html ?? null) === null));
  });
});
