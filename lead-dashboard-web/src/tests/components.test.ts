import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getDemoAccessState,
  renderAuditScoreBadge,
  renderCardDemoSlot,
  renderOpportunityBadge,
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

    const oppHtml = renderOpportunityBadge("website");
    assert.ok(oppHtml.includes("🌐 Site Web"));

    const auditHtml = renderAuditScoreBadge(32, "https://example.com");
    assert.ok(auditHtml.includes("Score : 32/100"));
    assert.ok(auditHtml.includes("text-rose-700"));
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
