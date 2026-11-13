/**
 * Définitions des besoins (opportunités) stockées en base, éditables depuis l'onglet admin « Besoins ».
 *
 * La table est remplie au premier accès avec les définitions du code (shared/opportunities) ; ensuite la base fait
 * foi, sauf la bascule unique des bilans (`migrateReportProofs`). Chaque requête charge les définitions (avec un cache court par isolat) et les installe dans le registre
 * partagé, si bien que tout le code qui lit `OPPORTUNITIES`, `findOpportunity`… voit la version de la base.
 */
import {
  CODE_OPPORTUNITIES,
  setOpportunityDefinitions,
  validateOpportunityDefinition,
  type OpportunityDefinition,
} from "../../../shared/opportunities";

export const OPPORTUNITY_DEFINITIONS_DDL = `CREATE TABLE IF NOT EXISTS opportunity_definitions (
  id          TEXT PRIMARY KEY,
  definition  TEXT NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0,
  version     INTEGER NOT NULL DEFAULT 1,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by  TEXT
)`;

export const OPPORTUNITY_HISTORY_DDL = `CREATE TABLE IF NOT EXISTS opportunity_definition_history (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  opportunity_id  TEXT NOT NULL,
  version         INTEGER NOT NULL,
  definition      TEXT NOT NULL,
  changed_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  changed_by      TEXT
)`;

export interface StoredOpportunity {
  def: OpportunityDefinition;
  position: number;
  version: number;
  updated_at: string;
  updated_by: string | null;
}

interface Row {
  id: string;
  definition: string;
  position: number;
  version: number;
  updated_at: string;
  updated_by: string | null;
}

const CACHE_MS = 15_000;
let cache: { at: number; rows: StoredOpportunity[] } | null = null;

export function invalidateOpportunityCache(): void {
  cache = null;
}

let seeded = false;

/**
 * Ajoute les définitions du code absentes de la base (premier accès, ou nouveau besoin livré avec le code).
 * Une définition déjà en base n'est jamais écrasée : la base fait foi. Une fois par isolat.
 */
async function seedIfEmpty(db: D1Database): Promise<void> {
  if (seeded) return;
  const pos = await db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS p FROM opportunity_definitions").first<{ p: number }>();
  const start = pos?.p ?? 0;
  await db.batch(
    CODE_OPPORTUNITIES.map((def, i) =>
      db
        .prepare("INSERT OR IGNORE INTO opportunity_definitions (id, definition, position, version, updated_by) VALUES (?, ?, ?, 1, 'code')")
        .bind(def.id, JSON.stringify(def), start + i),
    ),
  );
  seeded = true;
}

/** Besoins passés de la démo de site aux bilans (visibilité, acquisition) : la ligne stockée est remplacée une fois. */
const REPORT_MIGRATION_IDS = ["seo_local", "ads_acquisition"] as const;

/**
 * Bascule des bilans en production (décision du 13/11/2026 : « écrase au besoin ») : une ligne `seo_local` ou
 * `ads_acquisition` encore en démo de site est remplacée par la définition du code, même modifiée dans l'onglet
 * Besoins. Passe par l'enregistrement normal (nouvelle version, ancienne dans l'historique, `code-migration`) pour
 * pouvoir revenir en arrière. Idempotente : une ligne déjà sur un bilan n'est pas touchée. Renvoie le nombre de
 * lignes remplacées.
 */
export async function migrateReportProofs(db: D1Database): Promise<number> {
  let replaced = 0;
  for (const id of REPORT_MIGRATION_IDS) {
    const def = CODE_OPPORTUNITIES.find((d) => d.id === id);
    if (!def) continue;
    const row = await db
      .prepare("SELECT definition, version FROM opportunity_definitions WHERE id = ?")
      .bind(id)
      .first<{ definition: string; version: number }>();
    if (!row) continue;
    let kind: unknown;
    try {
      kind = (JSON.parse(row.definition) as { proof?: { kind?: unknown } } | null)?.proof?.kind;
    } catch {
      kind = undefined;
    }
    if (kind !== "demo_web") continue;
    const res = await saveOpportunityDefinition(db, def, row.version, "code-migration");
    if (res.ok) replaced++;
    else console.error(`[besoins] bascule de « ${id} » vers le bilan impossible : ${res.errors.join(" ; ")}`);
  }
  if (replaced > 0) console.log(`[besoins] ${replaced} besoin(s) basculé(s) vers les bilans`);
  return replaced;
}

let migrated = false;

/** Amorçage et bascule des bilans, une fois par isolat, avant la première lecture des définitions. */
async function prepareStore(db: D1Database): Promise<void> {
  await seedIfEmpty(db);
  if (migrated) return;
  await migrateReportProofs(db);
  migrated = true;
}

/** Lit les définitions en base (remplies depuis le code au premier accès). Les lignes invalides sont écartées. */
export async function readStoredOpportunities(db: D1Database): Promise<StoredOpportunity[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.rows;
  await prepareStore(db);
  const res = await db
    .prepare("SELECT id, definition, position, version, updated_at, updated_by FROM opportunity_definitions ORDER BY position, id")
    .all<Row>();
  const rows: StoredOpportunity[] = [];
  for (const r of res.results) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(r.definition);
    } catch {
      console.error(`[besoins] définition « ${r.id} » illisible (JSON)`);
      continue;
    }
    const v = validateOpportunityDefinition(parsed);
    if (!v.ok) {
      console.error(`[besoins] définition « ${r.id} » invalide : ${v.errors.join(" ; ")}`);
      continue;
    }
    rows.push({ def: v.def, position: r.position, version: r.version, updated_at: r.updated_at, updated_by: r.updated_by });
  }
  cache = { at: Date.now(), rows };
  return rows;
}

/** Charge les définitions de la base dans le registre partagé. Sans effet si la base est vide ou illisible. */
export async function loadOpportunityDefinitions(db: D1Database): Promise<StoredOpportunity[]> {
  try {
    const rows = await readStoredOpportunities(db);
    if (rows.length > 0) setOpportunityDefinitions(rows.map((r) => r.def));
    return rows;
  } catch (e) {
    console.error("[besoins] chargement impossible, définitions du code conservées", e);
    return [];
  }
}

export type SaveResult = { ok: true; version: number } | { ok: false; errors: string[]; status: 400 | 404 | 409 };

/**
 * Crée ou modifie une définition. `expectedVersion` évite d'écraser une modification faite entre-temps
 * (0 pour une création). L'ancienne version part dans l'historique.
 */
export async function saveOpportunityDefinition(
  db: D1Database,
  raw: unknown,
  expectedVersion: number,
  userId: string,
): Promise<SaveResult> {
  const v = validateOpportunityDefinition(raw);
  if (!v.ok) return { ok: false, errors: v.errors, status: 400 };
  const def = v.def;
  await seedIfEmpty(db);
  const current = await db
    .prepare("SELECT definition, version FROM opportunity_definitions WHERE id = ?")
    .bind(def.id)
    .first<{ definition: string; version: number }>();

  if (expectedVersion === 0) {
    if (current) return { ok: false, errors: [`un besoin « ${def.id} » existe déjà`], status: 409 };
    const pos = await db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS p FROM opportunity_definitions").first<{ p: number }>();
    await db
      .prepare("INSERT INTO opportunity_definitions (id, definition, position, version, updated_by) VALUES (?, ?, ?, 1, ?)")
      .bind(def.id, JSON.stringify(def), pos?.p ?? 0, userId)
      .run();
    invalidateOpportunityCache();
    return { ok: true, version: 1 };
  }

  if (!current) return { ok: false, errors: [`besoin « ${def.id} » introuvable`], status: 404 };
  if (current.version !== expectedVersion) {
    return { ok: false, errors: ["ce besoin a été modifié entre-temps : rechargez la page"], status: 409 };
  }
  const next = current.version + 1;
  const res = await db.batch([
    db
      .prepare("INSERT INTO opportunity_definition_history (opportunity_id, version, definition, changed_by) VALUES (?, ?, ?, ?)")
      .bind(def.id, current.version, current.definition, userId),
    db
      .prepare("UPDATE opportunity_definitions SET definition = ?, version = ?, updated_at = CURRENT_TIMESTAMP, updated_by = ? WHERE id = ? AND version = ?")
      .bind(JSON.stringify(def), next, userId, def.id, current.version),
  ]);
  if ((res[1]?.meta.changes ?? 0) === 0) return { ok: false, errors: ["ce besoin a été modifié entre-temps : rechargez la page"], status: 409 };
  invalidateOpportunityCache();
  return { ok: true, version: next };
}

export interface HistoryEntry {
  version: number;
  definition: OpportunityDefinition | null;
  changed_at: string;
  changed_by: string | null;
}

export async function opportunityHistory(db: D1Database, id: string, limit = 20): Promise<HistoryEntry[]> {
  const res = await db
    .prepare("SELECT version, definition, changed_at, changed_by FROM opportunity_definition_history WHERE opportunity_id = ? ORDER BY version DESC LIMIT ?")
    .bind(id, limit)
    .all<{ version: number; definition: string; changed_at: string; changed_by: string | null }>();
  return res.results.map((r) => {
    let definition: OpportunityDefinition | null = null;
    try {
      definition = JSON.parse(r.definition) as OpportunityDefinition;
    } catch {
      definition = null;
    }
    return { version: r.version, definition, changed_at: r.changed_at, changed_by: r.changed_by };
  });
}
