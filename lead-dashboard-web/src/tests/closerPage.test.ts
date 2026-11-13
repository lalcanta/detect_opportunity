import { describe, it } from "node:test";
import assert from "node:assert/strict";
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
