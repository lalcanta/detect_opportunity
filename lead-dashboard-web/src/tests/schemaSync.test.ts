/**
 * Le schéma vit à deux endroits : `schema.sql` (base neuve, tests) et `ensureAuthSchema` (src/auth.ts), qui migre la
 * production au démarrage (docs/agents/donnees-d1.md). Ce test échoue dès qu'ils divergent.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { LEAD_CONTACTS_DDL } from "../auth";
import { LEAD_ACTIVITIES_DDL } from "../services/activities";
import { EMAIL_OUTBOX_DDL } from "../services/emailOutbox";
import { MODEL_QUOTAS_DDL } from "../services/geminiQuota";
import { OPPORTUNITY_DEFINITIONS_DDL, OPPORTUNITY_HISTORY_DDL } from "../services/opportunityStore";

const root = new URL("../../", import.meta.url);
const schemaSql = readFileSync(new URL("schema.sql", root), "utf-8");
const authSrc = readFileSync(new URL("src/auth.ts", root), "utf-8");

/** Sans commentaires SQL, espaces réduits, sans point-virgule final. */
const norm = (sql: string): string =>
  sql
    .replace(/--[^\n]*/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([(),])\s*/g, "$1")
    .replace(/;\s*$/, "")
    .trim();

/** `CREATE TABLE IF NOT EXISTS <nom> (…)` d'un texte SQL, parenthèses équilibrées. */
function createTables(text: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /CREATE TABLE IF NOT EXISTS (\w+)\s*\(/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    let depth = 0;
    let end = m.index + m[0].length - 1;
    for (; end < text.length; end++) {
      if (text[end] === "(") depth++;
      else if (text[end] === ")" && --depth === 0) break;
    }
    out.set(m[1]!, norm(text.slice(m.index, end + 1)));
  }
  return out;
}

/** Définitions de colonnes d'une table normalisée : `nom` → `nom TYPE …`. */
function columns(normalizedTable: string): Map<string, string> {
  const body = normalizedTable.slice(normalizedTable.indexOf("(") + 1, -1);
  const parts: string[] = [];
  let depth = 0;
  let quoted = false;
  let cur = "";
  for (const ch of body) {
    if (ch === "'") quoted = !quoted;
    if (!quoted && ch === "(") depth++;
    if (!quoted && ch === ")") depth--;
    if (ch === "," && depth === 0 && !quoted) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);
  const out = new Map<string, string>();
  for (const p of parts.map((x) => x.trim())) {
    if (/^(UNIQUE|PRIMARY KEY|FOREIGN KEY|CHECK)\b/i.test(p)) continue;
    out.set(p.split(" ")[0]!, p);
  }
  return out;
}

const schemaTables = createTables(schemaSql);

describe("schéma : schema.sql et ensureAuthSchema (src/auth.ts)", () => {
  const copies: Record<string, string> = {
    LEAD_CONTACTS_DDL,
    LEAD_ACTIVITIES_DDL,
    EMAIL_OUTBOX_DDL,
    MODEL_QUOTAS_DDL,
    OPPORTUNITY_DEFINITIONS_DDL,
    OPPORTUNITY_HISTORY_DDL,
  };
  for (const [name, ddl] of Object.entries(copies)) {
    it(`${name} est identique à schema.sql`, () => {
      const [[table, def]] = [...createTables(ddl)];
      assert.ok(schemaTables.has(table!), `table ${table} absente de schema.sql`);
      assert.equal(def, schemaTables.get(table!));
    });
  }

  it("les tables créées en ligne dans auth.ts sont identiques à schema.sql", () => {
    for (const [table, def] of createTables(authSrc)) {
      assert.ok(schemaTables.has(table), `table ${table} absente de schema.sql`);
      assert.equal(def, schemaTables.get(table), `table ${table}`);
    }
  });

  it("chaque colonne ajoutée par ALTER TABLE existe dans schema.sql avec la même définition", () => {
    const re = /"ALTER TABLE (\w+) ADD COLUMN ((?:[^"\\]|\\.)*)"/g;
    let count = 0;
    for (let m = re.exec(authSrc); m; m = re.exec(authSrc)) {
      count++;
      const [, table, colDef] = m;
      const def = norm(colDef!.replace(/\\"/g, '"'));
      const name = def.split(" ")[0]!;
      const cols = columns(schemaTables.get(table!) ?? "");
      assert.ok(cols.has(name), `${table}.${name} absente de schema.sql`);
      // SQLite refuse `ADD COLUMN … UNIQUE` : seule différence admise.
      assert.equal(cols.get(name)!.replace(/ UNIQUE$/, ""), def, `${table}.${name}`);
    }
    assert.ok(count > 0, "aucun ALTER TABLE trouvé : le format de auth.ts a changé, adapter ce test");
  });
});
