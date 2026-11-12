-- Besoins (opportunités) éditables depuis l'admin, et version de la définition utilisée par chaque job.
CREATE TABLE IF NOT EXISTS opportunity_definitions (
  id          TEXT PRIMARY KEY,
  definition  TEXT NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0,
  version     INTEGER NOT NULL DEFAULT 1,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by  TEXT
);
CREATE TABLE IF NOT EXISTS opportunity_definition_history (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  opportunity_id  TEXT NOT NULL,
  version         INTEGER NOT NULL,
  definition      TEXT NOT NULL,
  changed_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  changed_by      TEXT
);
ALTER TABLE scan_jobs ADD COLUMN opportunity_version INTEGER;
