/** Démo de site complémentaire : GET /demos/:id/site partage le rendu de GET /demos/:id. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { publicRoutes, prepareDemoHtml } from "../routes/public";

type Row = Record<string, unknown> | null;

/** D1 minimal : `first()` renvoie la ligne (la colonne lue sous l'alias `html` y est copiée), le reste réussit sans rien faire. */
function fakeDb(row: Row) {
  const make = (sql: string) => {
    const col = /(\w+) AS html/.exec(sql)?.[1];
    const stmt = {
      bind: () => stmt,
      first: async () => (row && col ? { ...row, html: row[col] } : row),
      run: async () => ({ success: true, results: [] }),
      all: async () => ({ results: [] }),
    };
    return stmt;
  };
  return { prepare: make, batch: async () => [], exec: async () => ({}) } as never;
}

const BASE = {
  company_name: "Plomberie Martin",
  demo_html: null,
  site_demo_html: null,
  demo_revoked: 0,
  demo_expires_at: null,
  opportunity_type: "website",
  audit_data: JSON.stringify({ logoUrl: "https://martin.test/logo.png" }),
};

async function get(path: string, row: Row) {
  return publicRoutes.request(path, {}, { DB: fakeDb(row) });
}

describe("GET /demos/:id/site", () => {
  it("404 quand aucune démo de site n'est stockée", async () => {
    const res = await get("/demos/abc/site", { ...BASE, demo_html: "<html><body>principale</body></html>" });
    assert.equal(res.status, 404);
  });

  it("200 avec pixel de suivi, barre d'intérêt et logo remplacé", async () => {
    const html = '<html><head></head><body><img src="%%CLIENT_REAL_LOGO_URL%%">site</body></html>';
    const res = await get("/demos/abc/site", { ...BASE, site_demo_html: html });
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.ok(body.includes("/api/tracker/open?leadId=abc"));
    assert.ok(body.includes("le-floating-bar"));
    assert.ok(body.includes("https://martin.test/logo.png"));
    assert.ok(!body.includes("%%CLIENT_REAL_LOGO_URL%%"));
    assert.ok(body.includes('name="referrer"'));
  });

  it("410 quand la démo est révoquée", async () => {
    const res = await get("/demos/abc/site", { ...BASE, site_demo_html: "<html><body>x</body></html>", demo_revoked: 1 });
    assert.equal(res.status, 410);
  });

  it("/demos/:id sert toujours demo_html, pas la démo de site", async () => {
    const res = await get("/demos/abc", { ...BASE, demo_html: "<html><body>principale</body></html>", site_demo_html: "<html><body>complement</body></html>" });
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.ok(body.includes("principale") && !body.includes("complement"));
  });
});

describe("prepareDemoHtml", () => {
  it("aperçu interne : pas de pixel, script muet", () => {
    const out = prepareDemoHtml("<html><head></head><body>x</body></html>", { id: "abc", auditData: null, mediaEnabled: false, internalPreview: true });
    assert.ok(out.includes('sessionStorage.setItem("seen_abc"'));
    assert.ok(!out.includes("/api/tracker/open"));
  });

  it("aperçu externe : pixel injecté, pas de script muet", () => {
    const out = prepareDemoHtml("<html><head></head><body>x</body></html>", { id: "abc", auditData: null, mediaEnabled: false, internalPreview: false });
    assert.ok(out.includes("/api/tracker/open?leadId=abc"));
    assert.ok(!out.includes('setItem("seen_abc","1")}catch(e){}</script>\n</head>'));
  });
});
