-- Historique structuré des échanges d'un lead (docs/PLAN_REFONTE_LEADS.md §3.4).
-- Aussi créé à chaud par ensureAuthSchema() (src/auth.ts). Ce fichier sert aux bases créées à la main.
CREATE TABLE IF NOT EXISTS lead_activities (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id     TEXT NOT NULL REFERENCES leads(id),
  user_id     TEXT,
  kind        TEXT NOT NULL,
  channel     TEXT,
  summary     TEXT NOT NULL,
  content     TEXT,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_lead_activities_lead ON lead_activities(lead_id, created_at);
