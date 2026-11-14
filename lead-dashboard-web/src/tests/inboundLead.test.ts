import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { publicRoutes } from "../routes/public";

/** Base factice : enregistre les paramètres des requêtes, répond « rien » aux lectures. */
function fakeDb() {
  const binds: unknown[][] = [];
  const stmt = (sql: string) => ({
    bind: (...args: unknown[]) => {
      if (/INSERT INTO leads/.test(sql)) binds.push(args);
      return stmt(sql);
    },
    run: async () => ({ success: true, meta: {} }),
    first: async () => null,
    all: async () => ({ results: [] }),
  });
  return { binds, db: { prepare: stmt, exec: async () => ({}), batch: async () => [] } };
}

describe("lead entrant (formulaire public)", () => {
  it("aucun score inventé : audit_data.score vaut null", async () => {
    const { db, binds } = fakeDb();
    const res = await publicRoutes.request(
      "/api/public/inbound-lead",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company_name: "Acme", phone: "0102030405" }) },
      { DB: db } as never,
      { waitUntil: () => {}, passThroughOnException: () => {} } as never,
    );
    assert.equal(res.status, 200);
    assert.equal(binds.length, 1);
    const json = binds[0]!.find((v) => typeof v === "string" && v.startsWith("{") && "score" in JSON.parse(v));
    assert.ok(json, "audit_data introuvable dans les paramètres de l'INSERT");
    const audit = JSON.parse(json as string);
    assert.equal(audit.score, null);
  });
});
