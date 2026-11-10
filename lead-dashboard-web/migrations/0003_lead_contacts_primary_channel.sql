-- Phase 1 du plan de refonte des leads (docs/PLAN_REFONTE_LEADS.md §3.4).
-- Aussi appliqué à chaud par ensureAuthSchema() (src/auth.ts). Ce fichier sert aux bases créées à la main.
-- L'ALTER échoue si la colonne existe déjà : dans ce cas, exécuter seulement les CREATE.
ALTER TABLE leads ADD COLUMN primary_channel TEXT;

CREATE TABLE IF NOT EXISTS lead_contacts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id     TEXT NOT NULL REFERENCES leads(id),
  kind        TEXT NOT NULL,
  value       TEXT NOT NULL,
  source      TEXT NOT NULL,
  confidence  REAL,
  meta        TEXT,
  is_primary  INTEGER NOT NULL DEFAULT 0,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (lead_id, kind, value)
);
CREATE INDEX IF NOT EXISTS idx_lead_contacts_lead ON lead_contacts(lead_id, kind);
