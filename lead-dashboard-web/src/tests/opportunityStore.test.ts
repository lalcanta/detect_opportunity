import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CODE_OPPORTUNITIES } from "../../../shared/opportunities";
import {
  migrateReportProofs,
  readStoredOpportunities,
  resetOpportunityStoreForTests,
  saveOpportunityDefinition,
} from "../services/opportunityStore";

/**
 * Faux D1 minimal : ne connaît que les requêtes de opportunityStore.ts (tables opportunity_definitions et
 * opportunity_definition_history), reconnues par leur début.
 */
interface DefRow { id: string; definition: string; position: number; version: number; updated_at: string; updated_by: string | null }
interface HistRow { opportunity_id: string; version: number; definition: string; changed_by: string | null }

function fakeD1() {
  const defs = new Map<string, DefRow>();
  const history: HistRow[] = [];
  const calls = { updates: 0 };
  const exec = (sql: string, args: unknown[]) => {
    const s = sql.replace(/\s+/g, " ").trim();
    if (s.startsWith("SELECT DISTINCT opportunity_id FROM opportunity_definition_history WHERE changed_by = 'code-migration'")) {
      const ids = new Set(history.filter((h) => h.changed_by === "code-migration" && args.includes(h.opportunity_id)).map((h) => h.opportunity_id));
      return { all: [...ids].map((opportunity_id) => ({ opportunity_id })), changes: 0 };
    }
    if (s.startsWith("SELECT COALESCE(MAX(position)")) {
      const max = Math.max(-1, ...[...defs.values()].map((r) => r.position));
      return { first: { p: max + 1 }, changes: 0 };
    }
    if (s.startsWith("INSERT OR IGNORE INTO opportunity_definitions")) {
      const [id, definition, position] = args as [string, string, number];
      if (defs.has(id)) return { changes: 0 };
      defs.set(id, { id, definition, position, version: 1, updated_at: "2026-11-01 00:00:00", updated_by: "code" });
      return { changes: 1 };
    }
    if (s.startsWith("INSERT INTO opportunity_definitions")) {
      const [id, definition, position, by] = args as [string, string, number, string];
      defs.set(id, { id, definition, position, version: 1, updated_at: "2026-11-01 00:00:00", updated_by: by });
      return { changes: 1 };
    }
    if (s.startsWith("SELECT definition, version FROM opportunity_definitions WHERE id = ?")) {
      const r = defs.get(args[0] as string);
      return { first: r ? { definition: r.definition, version: r.version } : null, changes: 0 };
    }
    if (s.startsWith("SELECT id, definition, position")) {
      const rows = [...defs.values()].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
      return { all: rows, changes: 0 };
    }
    if (s.startsWith("INSERT INTO opportunity_definition_history")) {
      const [opportunity_id, version, definition, changed_by] = args as [string, number, string, string];
      history.push({ opportunity_id, version, definition, changed_by });
      return { changes: 1 };
    }
    if (s.startsWith("UPDATE opportunity_definitions SET definition = ?")) {
      calls.updates++;
      const [definition, next, by, id, expected] = args as [string, number, string, string, number];
      const r = defs.get(id);
      if (!r || r.version !== expected) return { changes: 0 };
      Object.assign(r, { definition, version: next, updated_by: by, updated_at: "2026-11-13 00:00:00" });
      return { changes: 1 };
    }
    throw new Error(`requête inattendue : ${s}`);
  };
  const statement = (sql: string, args: unknown[] = []) => ({
    bind: (...a: unknown[]) => statement(sql, a),
    first: async () => exec(sql, args).first ?? null,
    all: async () => ({ results: exec(sql, args).all ?? [] }),
    run: async () => ({ meta: { changes: exec(sql, args).changes } }),
    _exec: () => ({ meta: { changes: exec(sql, args).changes } }),
  });
  const db = {
    prepare: (sql: string) => statement(sql),
    batch: async (stmts: Array<ReturnType<typeof statement>>) => stmts.map((st) => st._exec()),
  };
  return { db: db as unknown as D1Database, defs, history, calls };
}

const code = (id: string) => CODE_OPPORTUNITIES.find((d) => d.id === id)!;
/** Ancienne définition stockée en production : démo de site comme preuve, modifiée dans l'onglet Besoins. */
const oldDemo = (id: string) => ({
  ...code(id),
  status: "active",
  label: `${code(id).label} (modifié)`,
  proof: { kind: "demo_web", generator: "llm_demo", focus: id === "seo_local" ? "seo_local" : "ads_acquisition", interestCta: "Ce site me plaît, on en discute" },
});
const put = (defs: Map<string, DefRow>, id: string, def: unknown, version = 3) =>
  defs.set(id, { id, definition: JSON.stringify(def), position: defs.size, version, updated_at: "2026-11-10 00:00:00", updated_by: "u-loic" });

describe("bascule des bilans (migrateReportProofs)", () => {
  it("remplace une ligne en démo de site par la définition du code, avec historique, une seule fois", async () => {
    const { db, defs, history } = fakeD1();
    put(defs, "seo_local", oldDemo("seo_local"));
    put(defs, "ads_acquisition", oldDemo("ads_acquisition"));

    assert.equal(await migrateReportProofs(db), 2);
    for (const id of ["seo_local", "ads_acquisition"]) {
      const row = defs.get(id)!;
      assert.deepEqual(JSON.parse(row.definition), JSON.parse(JSON.stringify(code(id))));
      assert.equal(row.version, 4);
      assert.equal(row.updated_by, "code-migration");
      const h = history.filter((x) => x.opportunity_id === id);
      assert.equal(h.length, 1);
      assert.equal(h[0]!.version, 3);
      assert.equal(h[0]!.changed_by, "code-migration");
      assert.equal(JSON.parse(h[0]!.definition).proof.kind, "demo_web");
    }

    assert.equal(await migrateReportProofs(db), 0);
    assert.equal(history.length, 2);
    assert.equal(defs.get("seo_local")!.version, 4);
  });

  it("laisse intacte une ligne déjà sur un bilan, et les autres besoins", async () => {
    const { db, defs, history } = fakeD1();
    const edited = { ...code("seo_local"), label: "Visibilité locale (Loïc)", complementDemo: "never" };
    put(defs, "seo_local", edited);
    put(defs, "website_redesign", code("website_redesign"));

    assert.equal(await migrateReportProofs(db), 0);
    assert.equal(defs.get("seo_local")!.definition, JSON.stringify(edited));
    assert.equal(defs.get("seo_local")!.version, 3);
    assert.equal(history.length, 0);
  });

  it("ne fait rien quand les lignes sont absentes", async () => {
    const { db, defs } = fakeD1();
    assert.equal(await migrateReportProofs(db), 0);
    assert.equal(defs.size, 0);
  });

  it("une seule fois au total : un retour à la démo de site fait dans l'onglet Besoins est conservé", async () => {
    const { db, defs } = fakeD1();
    put(defs, "seo_local", oldDemo("seo_local"));
    assert.equal(await migrateReportProofs(db), 1);
    // Loïc rétablit l'ancienne version depuis l'historique (enregistrement normal, version 5).
    const restored = await saveOpportunityDefinition(db, oldDemo("seo_local"), 4, "u-loic");
    assert.deepEqual(restored, { ok: true, version: 5 });
    // Nouvel isolat : la bascule ne repasse pas.
    assert.equal(await migrateReportProofs(db), 0);
    assert.equal(JSON.parse(defs.get("seo_local")!.definition).proof.kind, "demo_web");
    assert.equal(defs.get("seo_local")!.version, 5);
  });

  it("deux appels simultanés : un seul enregistrement, sans erreur", async () => {
    const { db, defs, calls } = fakeD1();
    put(defs, "seo_local", oldDemo("seo_local"));
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...a: unknown[]) => void errors.push(a);
    try {
      const [a, b] = await Promise.all([migrateReportProofs(db), migrateReportProofs(db)]);
      assert.equal(a + b, 1);
    } finally {
      console.error = original;
    }
    assert.equal(calls.updates, 1);
    assert.deepEqual(errors, []);
    assert.equal(defs.get("seo_local")!.version, 4);
  });

  it("premières requêtes simultanées d'un isolat : la bascule ne tourne qu'une fois", async () => {
    resetOpportunityStoreForTests();
    const { db, defs, calls } = fakeD1();
    put(defs, "seo_local", oldDemo("seo_local"));
    await Promise.all([readStoredOpportunities(db), readStoredOpportunities(db), readStoredOpportunities(db)]);
    assert.equal(calls.updates, 1);
    assert.equal(defs.get("seo_local")!.updated_by, "code-migration");
  });

  it("tourne avant la première lecture des définitions", async () => {
    resetOpportunityStoreForTests();
    const { db, defs } = fakeD1();
    put(defs, "seo_local", oldDemo("seo_local"));
    const rows = await readStoredOpportunities(db);
    assert.equal(rows.find((r) => r.def.id === "seo_local")?.def.proof.kind, "visibility_report");
    assert.equal(defs.get("seo_local")!.updated_by, "code-migration");
  });
});
