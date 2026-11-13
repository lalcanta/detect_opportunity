/**
 * Le schéma vit à deux endroits : `schema.sql` (base neuve, tests) et `ensureAuthSchema` (src/auth.ts), qui migre la
 * production au démarrage (docs/agents/donnees-d1.md). Ce test échoue dès qu'ils divergent.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";
import { LEAD_CONTACTS_DDL } from "../auth";
import { LEAD_ACTIVITIES_DDL } from "../services/activities";
import { EMAIL_OUTBOX_DDL, EMAIL_OUTBOX_INDEX } from "../services/emailOutbox";
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

/**
 * Colonnes présentes en production avant que les ajouts passent par `ensureAuthSchema` (figé le 13/11/2026) : elles
 * n'ont pas d'ALTER TABLE. Toute nouvelle colonne d'une de ces tables doit en avoir un ; ne pas allonger cette liste.
 */
const BASE_COLUMNS: Record<string, string[]> = {
  users: ["id", "name", "role", "is_active", "phone_quota_weekly", "access_token", "google_access_token", "google_refresh_token", "google_token_expiry", "google_calendar_id", "google_email", "allowed_opportunities"],
  leads: ["id", "company_name", "activity", "city", "phone", "email", "website_url", "google_rating", "google_reviews_count", "audit_data", "demo_html", "flyer_pdf_url", "flyer_pdf_base64", "battlecard_data", "assigned_to", "assigned_at", "locked_by", "locked_until", "demo_viewed_count", "last_demo_viewed_at", "status", "callback_scheduled_at", "call_notes", "google_calendar_event_id", "opportunity_type", "created_at"],
  token_usage: ["id", "lead_id", "task", "model", "input_tokens", "output_tokens", "thinking_tokens", "created_at"],
  scan_jobs: ["id", "query", "city", "lead_limit", "use_cdp", "lat", "lng", "radius_km", "opportunity_type", "website_filter", "status", "requested_by", "created_at", "started_at", "finished_at", "processed", "total", "message", "logs"],
  model_settings: ["action_type", "provider", "model", "thinking_budget", "updated_at"],
};

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
      const found = [...createTables(ddl)];
      assert.equal(found.length, 1, `${name} doit commencer par « CREATE TABLE IF NOT EXISTS <table> ( »`);
      const [[table, def]] = found;
      assert.ok(schemaTables.has(table!), `table ${table} absente de schema.sql`);
      assert.equal(def, schemaTables.get(table!));
    });
  }

  it("toute constante …_DDL du code est vérifiée ici", () => {
    const exported = new Set<string>();
    for (const file of readdirSync(new URL("src/", root), { recursive: true }) as string[]) {
      if (!file.endsWith(".ts") || file.includes("tests")) continue;
      const src = readFileSync(new URL(`src/${file}`, root), "utf-8");
      for (const m of src.matchAll(/export const (\w+_DDL) = `CREATE TABLE/g)) exported.add(m[1]!);
    }
    assert.deepEqual([...exported].filter((n) => !(n in copies)), [], "ajouter ces constantes à `copies` dans ce test");
  });

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
    const written = authSrc.match(/ALTER TABLE \w+ ADD COLUMN/g)?.length ?? 0;
    assert.ok(count > 0, "aucun ALTER TABLE trouvé : le format de auth.ts a changé, adapter ce test");
    assert.equal(count, written, "un ALTER TABLE n'est pas écrit entre guillemets doubles : ce test ne le lit pas");
  });

  it("chaque colonne de schema.sql existe en production : socle d'origine ou ALTER TABLE dans auth.ts", () => {
    const altered = new Set([...authSrc.matchAll(/ALTER TABLE (\w+) ADD COLUMN (\w+)/g)].map((m) => `${m[1]}.${m[2]}`));
    const created = new Set([...createTables(authSrc).keys(), ...Object.values(copies).flatMap((d) => [...createTables(d).keys()])]);
    const missing: string[] = [];
    for (const [table, def] of schemaTables) {
      if (created.has(table)) continue;
      for (const col of columns(def).keys()) {
        if (!(BASE_COLUMNS[table] ?? []).includes(col) && !altered.has(`${table}.${col}`)) missing.push(`${table}.${col}`);
      }
    }
    assert.deepEqual(missing, [], "colonnes sans ALTER TABLE dans ensureAuthSchema : la production ne les aura pas");
  });

  it("chaque index créé par le code existe dans schema.sql", () => {
    const sources = [authSrc, EMAIL_OUTBOX_INDEX];
    const schemaIndexes = new Set([...schemaSql.matchAll(/CREATE (?:UNIQUE )?INDEX IF NOT EXISTS [^;]+/g)].map((m) => norm(m[0])));
    for (const src of sources) {
      for (const m of src.matchAll(/CREATE (?:UNIQUE )?INDEX IF NOT EXISTS [^"`;]+/g)) {
        assert.ok(schemaIndexes.has(norm(m[0])), `index absent ou différent dans schema.sql : ${norm(m[0])}`);
      }
    }
  });
});
