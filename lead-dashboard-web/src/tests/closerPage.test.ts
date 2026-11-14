import { describe, it } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { closerPage } from "../views/closer";
import type { LeadRow, User } from "../types";

const user: User = { id: "u1", name: "Admin", role: "admin", is_active: 1, phone_quota_weekly: 50 };

function lead(over: Partial<LeadRow>): LeadRow {
  return {
    id: "l1",
    company_name: "Plomberie Test",
    activity: "Plombier",
    city: "Lyon",
    phone: null,
    email: null,
    website_url: null,
    google_rating: null,
    google_reviews_count: null,
    audit_data: null,
    flyer_pdf_url: null,
    battlecard_data: null,
    assigned_to: null,
    assigned_at: null,
    locked_by: null,
    locked_until: null,
    demo_viewed_count: 0,
    last_demo_viewed_at: null,
    status: "to_contact" as LeadRow["status"],
    call_notes: null,
    created_at: "2026-11-13T10:00:00Z",
    ...over,
  };
}

/** Contenu des balises <script> inline de la page. */
function inlineScripts(html: string): string[] {
  return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
}

describe("closerPage — données injectées dans le script", () => {
  it("un </script> venu du site du prospect ne ferme pas le script de la page", () => {
    const audit = { seo: { title: "</script><img src=x onerror=alert(1)>", h1: "</SCRIPT>", metaDescription: "<!--" }, competitors: [{ name: "</script>" }] };
    const html = closerPage({
      user,
      leads: [lead({ audit_data: JSON.stringify(audit), company_name: "A </script> B" })],
      scope: "all",
      view: "kanban",
      origin: "https://crm.test",
    });
    const scripts = inlineScripts(html);
    const main = scripts.find((s) => s.includes("var LEADS_MAP"));
    assert.ok(main, "le script principal doit être intact");
    assert.ok(main.includes("var COLUMNS_MAP"), "le script ne doit pas être coupé avant COLUMNS_MAP");
    assert.ok(!html.includes("<img src=x onerror"), "aucune balise injectée ne doit apparaître telle quelle");
    assert.ok(main.includes("\\u003c/script>"), "le < doit être échappé en \\u003c");
  });
});

describe("closerPage — filtre des besoins", () => {
  const oppLinks = (html: string): string[] => [...new Set([...html.matchAll(/(?:[?&;])opp=([\w-]+)/g)].map((m) => m[1]!))];

  it("l'admin ne voit que les besoins actifs, ni brouillon ni archivé", () => {
    const links = oppLinks(closerPage({ user, leads: [], scope: "all", view: "list", origin: "https://crm.test" }));
    assert.ok(links.includes("website_redesign"), "besoin actif proposé");
    for (const id of ["seo_local", "ads_acquisition", "website", "custom"]) assert.ok(!links.includes(id), `${id} ne doit pas être proposé`);
  });

  it("un closer ne voit que ses besoins actifs, et le compteur ne compte qu'eux", () => {
    const closer: User = { ...user, id: "c1", role: "closer", allowed_opportunities: JSON.stringify(["website_redesign", "seo_local"]) };
    const html = closerPage({ user: closer, leads: [], scope: "mine", view: "list", origin: "https://crm.test" });
    const links = oppLinks(html);
    assert.ok(links.includes("website_redesign"));
    assert.ok(!links.includes("seo_local"));
    assert.ok(html.includes("Tous mes besoins (1)"));
  });
});

describe("closerPage — score d'audit absent", () => {
  const render = (audit: unknown) =>
    closerPage({
      user,
      leads: [lead({ website_url: "https://exemple.fr", audit_data: JSON.stringify(audit) })],
      scope: "all",
      view: "kanban",
      origin: "https://crm.test",
    });

  it("un audit sans score ou à score nul n'affiche aucune mention de score", () => {
    for (const audit of [{ summary: "x" }, { summary: "x", score: null }]) {
      const html = render(audit);
      assert.ok(!html.includes("Score :"), JSON.stringify(audit));
      assert.ok(!/\/100\b/.test(html), JSON.stringify(audit));
      assert.ok(html.includes("Site en ligne"), "le badge de repli reste affiché");
    }
  });

  it("un score mesuré (bilan) reste affiché", () => {
    assert.ok(render({ score: 62, scoreSource: "measured" }).includes("Score : 62/100"));
  });

  it("un score estimé par l'IA, ou sans origine, est affiché comme une estimation", () => {
    for (const extra of [{ scoreSource: "ai_estimate" }, {}]) {
      const html = render({ score: 62, ...extra });
      assert.ok(html.includes("Estimation IA : 62/100"));
      assert.ok(!html.includes("Score : 62/100"));
    }
  });
});

describe("closerPage — panneau sans argument", () => {
  const html = closerPage({ user, leads: [lead({})], scope: "all", view: "kanban", origin: "https://crm.test" });
  it("aucun argument de repli inventé : la section « Arguments » se masque quand la liste est vide", () => {
    assert.ok(!html.includes("Barre d'appel d'urgence mobile collante"));
    assert.ok(!html.includes("Design moderne ultra-rapide"));
    assert.match(html, /advSection\.classList\.toggle\('hidden', advItems\.length === 0\)/);
  });
});

describe("closerPage — JavaScript client", () => {
  it("chaque <script> inline se compile (aucune erreur de syntaxe)", () => {
    const html = closerPage({ user, leads: [lead({})], scope: "all", view: "kanban", origin: "https://crm.test" });
    const scripts = inlineScripts(html).filter((s) => s.trim());
    assert.ok(scripts.length > 0);
    for (const code of scripts) assert.doesNotThrow(() => new vm.Script(code));
  });
});
