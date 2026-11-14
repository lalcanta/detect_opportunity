import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getDemoAccessState,
  renderAuditScoreBadge,
  renderCardDemoSlot,
  metaAdLibraryUrl,
  renderOpportunityBadge,
  renderReportBrief,
  renderStatusPill,
} from "../views/components";
import { adminPage } from "../views/admin";
import { closerPage } from "../views/closer";
import type { User } from "../types";

const mockAdminUser: User = {
  id: "u_admin",
  name: "Loïc Admin",
  email: "admin@agence.local",
  role: "admin",
  phone_quota_weekly: 100,
  access_token: "tok",
  is_active: 1,
};

function assertValidInlineScripts(html: string, pageLabel: string): void {
  const scriptRegex = /<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  let count = 0;
  while ((match = scriptRegex.exec(html)) !== null) {
    count++;
    const code = match[1]!;
    assert.doesNotThrow(() => {
      // Parses the inline JS without executing it
      new Function(code);
    }, `Inline <script> #${count} in ${pageLabel} has a JavaScript SyntaxError`);
  }
  assert.ok(count > 0, `Expected at least one inline <script> in ${pageLabel}`);
}

describe("Reusable UI Components (lead-dashboard-web/src/views/components.ts)", () => {
  it("getDemoAccessState returns active state when demo is neither revoked nor expired", () => {
    const state = getDemoAccessState({ demo_revoked: 0, demo_expires_at: null });
    assert.equal(state.isRevoked, false);
    assert.equal(state.isExpired, false);
    assert.equal(state.isInactive, false);
    assert.equal(state.canOpenDemo, true);
    assert.equal(state.canRevoke, true);
  });

  it("getDemoAccessState hides demo button and revoke button when demo_revoked === 1", () => {
    const state = getDemoAccessState({ demo_revoked: 1, demo_expires_at: null });
    assert.equal(state.isRevoked, true);
    assert.equal(state.isInactive, true);
    assert.equal(state.canOpenDemo, false);
    assert.equal(state.canRevoke, false);
    assert.equal(state.cardBadgeText, "🔒 Démo invalidée");
    assert.equal(state.extendButtonText, "🔄 Réactiver (+5 jours)");
  });

  it("getDemoAccessState hides demo button when demo_expires_at is in the past", () => {
    const pastIso = new Date(Date.now() - 3600_000).toISOString();
    const state = getDemoAccessState({ demo_revoked: 0, demo_expires_at: pastIso });
    assert.equal(state.isExpired, true);
    assert.equal(state.isInactive, true);
    assert.equal(state.canOpenDemo, false);
    assert.equal(state.canRevoke, false);
    assert.equal(state.cardBadgeText, "⏳ Démo expirée");
  });

  it("renderCardDemoSlot renders link when active and badge without link when revoked (compact & button variants)", () => {
    const activeCompact = renderCardDemoSlot({ id: "lead-1", demo_revoked: 0, demo_expires_at: null }, "compact");
    assert.ok(activeCompact.includes('href="/demos/lead-1"'));
    assert.ok(activeCompact.includes('data-demo-variant="compact"'));

    const revokedCompact = renderCardDemoSlot({ id: "lead-1", demo_revoked: 1, demo_expires_at: null }, "compact");
    assert.ok(!revokedCompact.includes('href="/demos/lead-1"'));
    assert.ok(revokedCompact.includes("🔒 Démo invalidée"));

    const revokedButton = renderCardDemoSlot({ id: "lead-2", demo_revoked: 1, demo_expires_at: null }, "button");
    assert.ok(!revokedButton.includes('href="/demos/lead-2"'));
    assert.ok(revokedButton.includes('data-demo-variant="button"'));
    assert.ok(revokedButton.includes("🔒 Démo invalidée"));
  });

  it("renderStatusPill and renderOpportunityBadge render consistent badges", () => {
    const statusHtml = renderStatusPill("hot_lead");
    assert.ok(statusHtml.includes("🔥 Lead Chaud"));

    const oppHtml = renderOpportunityBadge("website_redesign");
    assert.ok(oppHtml.includes("Refonte de site"));

    const auditHtml = renderAuditScoreBadge(32, "https://example.com");
    assert.ok(auditHtml.includes("Score : 32/100"));
    assert.ok(auditHtml.includes("text-rose-700"));
  });

  it("renderAuditScoreBadge : un score absent ou nul n'affiche aucun chiffre", () => {
    for (const score of [undefined, null]) {
      const html = renderAuditScoreBadge(score, "https://example.com");
      assert.ok(html.includes("Site en ligne"));
      assert.ok(!/Score|null|NaN|undefined|\/100/.test(html));
    }
  });

  it("adminPage and closerPage inline <script> blocks have zero JavaScript syntax errors", () => {
    for (const tab of ["overview", "scanner", "models", "benchmarks", "team", "attribution"]) {
      const html = adminPage({
        user: mockAdminUser,
        leads: [],
        users: [mockAdminUser],
        stats: { total: 0, won: 0, byStatus: [], tokens: [] },
        scans: [],
        scheduledScans: [
          {
            id: 1,
            label: "Routine Matin",
            cron_expr: "30 8 * * 1-5",
            time_of_day: "08:30",
            days_of_week: "1,2,3,4,5",
            query: "plombier",
            city: "Pamiers",
            lead_limit: 10,
            use_cdp: 0,
            opportunity_type: "website",
            website_filter: "all",
            is_active: 1,
            created_at: new Date().toISOString(),
          },
        ],
        models: [],
        availableModels: [],
        tab,
      });
      assertValidInlineScripts(html, `adminPage(tab=${tab})`);
    }

    for (const view of ["backlog", "list", "calendar"]) {
      const html = closerPage({
        user: mockAdminUser,
        leads: [],
        scope: "all",
        view,
        origin: "http://localhost:8788",
      });
      assertValidInlineScripts(html, `closerPage(view=${view})`);
    }
  });
});

describe("bloc Bilan de la fiche du closer (renderReportBrief)", () => {
  const audit = {
    maps_rank: 3,
    maps_query: "plombier Foix",
    maps_checked_at: "2026-11-12T09:00:00.000Z",
    competitors: [
      { name: "Plomberie <b>Martin</b>", rank: 1, rating: 4.8, reviewsCount: 120, website: "https://martin.fr", category: "Plombier" },
      { name: "Durand & fils", rank: 2, rating: 4.5, reviewsCount: 40, website: null, category: "Plombier" },
      { name: "Après lui", rank: 4, rating: 4.9, reviewsCount: 300, website: null, category: "Plombier" },
    ],
  };
  const lead = (opportunity_type: string, extra: Record<string, unknown> = {}) => ({
    id: "abc",
    company_name: "Plomberie Dupont & Cie",
    opportunity_type,
    audit_data: JSON.stringify(audit),
    has_site_demo: 0,
    ...extra,
  });

  it("montre le rang, la recherche telle que lancée et les concurrents devant, échappés", () => {
    const html = renderReportBrief(lead("seo_local"), "https://crm.test/");
    assert.match(html, /3e sur Maps/);
    assert.match(html, /« plombier Foix »/);
    assert.match(html, /constat du 12\/11\/2026/);
    assert.match(html, /Plomberie &lt;b&gt;Martin&lt;\/b&gt;/);
    assert.match(html, /Durand &amp; fils/);
    assert.match(html, /\(120 avis\)/);
    assert.doesNotMatch(html, /Après lui/);
    assert.match(html, /href="https:\/\/crm\.test\/demos\/abc"/);
    assert.doesNotMatch(html, /\/demos\/abc\/site/);
    assert.doesNotMatch(html, /facebook\.com/);
  });

  it("lien vers la démo de site seulement quand elle existe", () => {
    assert.match(renderReportBrief(lead("seo_local", { has_site_demo: 1 }), "https://crm.test"), /href="https:\/\/crm\.test\/demos\/abc\/site"/);
  });

  it("lien vers la bibliothèque Meta pour le bilan d'acquisition uniquement", () => {
    const html = renderReportBrief(lead("ads_acquisition"), "https://crm.test");
    assert.ok(html.includes(`href="${metaAdLibraryUrl("Plomberie Dupont & Cie").replace(/&/g, "&amp;")}"`));
    assert.equal(
      metaAdLibraryUrl("Plomberie Dupont & Cie"),
      "https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=FR&q=Plomberie%20Dupont%20%26%20Cie",
    );
    assert.match(html, /Voir ses publicités Meta/);
  });

  it("rien pour un autre besoin ou un lead sans constat Maps", () => {
    assert.equal(renderReportBrief(lead("website_redesign"), "https://crm.test"), "");
    assert.equal(renderReportBrief(lead("seo_local", { audit_data: JSON.stringify({ summary: "ancien" }) }), "https://crm.test"), "");
    assert.equal(renderReportBrief(lead("seo_local", { audit_data: "pas du json" }), "https://crm.test"), "");
  });

  it("en tête de la recherche, ou absent des résultats", () => {
    const first = renderReportBrief(lead("seo_local", { audit_data: JSON.stringify({ ...audit, maps_rank: 1, competitors: [audit.competitors[2]] }) }), "https://crm.test");
    assert.match(first, /1er sur Maps/);
    assert.match(first, /aucun concurrent devant/);
    const absent = renderReportBrief(lead("seo_local", { audit_data: JSON.stringify({ ...audit, maps_rank: null }) }), "https://crm.test");
    assert.match(absent, /Hors des résultats relevés/);
    assert.match(absent, /Après lui/);
  });

  it("scan par liste de domaines (ni recherche ni rang) : position non mesurée, jamais « hors des résultats »", () => {
    const domains = renderReportBrief(lead("seo_local", { audit_data: JSON.stringify({ maps_rank: null, maps_query: null, competitors: [], no_maps_listing: true }) }), "https://crm.test");
    assert.match(domains, /Position non mesurée/);
    assert.doesNotMatch(domains, /Hors des résultats relevés/);
  });
});

describe("catalogue de l'onglet Besoins", () => {
  it("fournit les preuves « bilan » et le choix de la démo complémentaire", async () => {
    const { needsTab } = await import("../views/needs");
    const json = /<script type="application\/json" id="needs-catalog">([\s\S]*?)<\/script>/.exec(needsTab())![1]!;
    const catalog = JSON.parse(json) as { reportProofs: string[]; complementDemo: { id: string; label: string }[]; proof: Record<string, { label: string }>; nodes: { id: string }[] };
    assert.deepEqual(catalog.reportProofs, ["visibility_report", "acquisition_report"]);
    assert.deepEqual(catalog.complementDemo.map((m) => [m.id, m.label]), [["auto", "Automatique"], ["always", "Toujours"], ["never", "Jamais"]]);
    assert.equal(catalog.proof.visibility_report!.label, "Bilan de visibilité");
    assert.ok(catalog.nodes.some((n) => n.id === "site_demo"));
  });
});
