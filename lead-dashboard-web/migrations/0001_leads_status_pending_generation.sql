-- Migration 0001 — autorise le statut 'pending_generation' dans leads.status
--
-- Contexte : /api/sync écrit 'pending_generation' pour les leads préparés en mode prep (0 €),
-- mais la contrainte CHECK d'origine ne l'autorisait pas. SQLite ne permet pas de modifier un CHECK :
-- la table est reconstruite à l'identique (même colonnes, mêmes index) avec la nouvelle contrainte.
--
-- Pré-requis : la table leads doit déjà posséder toutes les colonnes listées ci-dessous
-- (vérifier avec : SELECT sql FROM sqlite_master WHERE name = 'leads';).
-- Idempotent en pratique : rejouer la migration reconstruit la table sans perte.
-- Rien ne référence leads par clé étrangère (token_usage.lead_id n'a pas de FK).

PRAGMA defer_foreign_keys = true;

CREATE TABLE leads_new (
  id                   TEXT PRIMARY KEY,
  company_name         TEXT NOT NULL,
  activity             TEXT,
  city                 TEXT,
  phone                TEXT,
  email                TEXT,
  website_url          TEXT,
  google_rating        REAL,
  google_reviews_count INTEGER,
  audit_data           TEXT,
  demo_html            TEXT,
  flyer_pdf_url        TEXT,
  flyer_pdf_base64     TEXT,
  battlecard_data      TEXT,
  assigned_to          TEXT REFERENCES users(id),
  assigned_at          DATETIME,
  locked_by            TEXT,
  locked_until         DATETIME,
  demo_viewed_count    INTEGER NOT NULL DEFAULT 0,
  last_demo_viewed_at  DATETIME,
  demo_revoked         INTEGER NOT NULL DEFAULT 0,
  demo_expires_at      DATETIME,
  status               TEXT NOT NULL DEFAULT 'demo_ready'
                       CHECK (status IN ('pending_generation','demo_ready','hot_lead','called','won','lost','callback_scheduled')),
  callback_scheduled_at DATETIME,
  call_notes           TEXT,
  google_calendar_event_id TEXT,
  opportunity_type     TEXT NOT NULL DEFAULT 'website',
  created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO leads_new (
  id, company_name, activity, city, phone, email, website_url, google_rating, google_reviews_count,
  audit_data, demo_html, flyer_pdf_url, flyer_pdf_base64, battlecard_data, assigned_to, assigned_at,
  locked_by, locked_until, demo_viewed_count, last_demo_viewed_at, demo_revoked, demo_expires_at,
  status, callback_scheduled_at, call_notes, google_calendar_event_id, opportunity_type, created_at
)
SELECT
  id, company_name, activity, city, phone, email, website_url, google_rating, google_reviews_count,
  audit_data, demo_html, flyer_pdf_url, flyer_pdf_base64, battlecard_data, assigned_to, assigned_at,
  locked_by, locked_until, COALESCE(demo_viewed_count, 0), last_demo_viewed_at, COALESCE(demo_revoked, 0), demo_expires_at,
  status, callback_scheduled_at, call_notes, google_calendar_event_id, COALESCE(opportunity_type, 'website'), created_at
FROM leads;

DROP TABLE leads;
ALTER TABLE leads_new RENAME TO leads;

CREATE INDEX IF NOT EXISTS idx_leads_assigned ON leads(assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_leads_status   ON leads(status);
