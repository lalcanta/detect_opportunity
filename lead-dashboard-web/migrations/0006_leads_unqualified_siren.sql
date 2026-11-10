-- Migration 0006 — statut 'unqualified' (prérequis non remplis) et colonne siren (doublons).
-- Reconstruit leads (SQLite ne modifie pas un CHECK) en conservant toutes ses colonnes, lead_contacts et lead_activities.
-- Pré-requis : leads a déjà primary_channel et siren (ensureAuthSchema ajoute siren à chaud au premier appel ;
-- sinon : ALTER TABLE leads ADD COLUMN siren TEXT; avant cette migration).

PRAGMA defer_foreign_keys = true;

CREATE TABLE lead_contacts_tmp AS SELECT * FROM lead_contacts;
DELETE FROM lead_contacts;
CREATE TABLE lead_activities_tmp AS SELECT * FROM lead_activities;
DELETE FROM lead_activities;

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
                       CHECK (status IN ('pending_generation','unqualified','demo_ready','hot_lead','called','won','lost','callback_scheduled')),
  callback_scheduled_at DATETIME,
  call_notes           TEXT,
  google_calendar_event_id TEXT,
  opportunity_type     TEXT NOT NULL DEFAULT 'website',
  primary_channel      TEXT,
  siren                TEXT,
  created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO leads_new (
  id, company_name, activity, city, phone, email, website_url, google_rating, google_reviews_count,
  audit_data, demo_html, flyer_pdf_url, flyer_pdf_base64, battlecard_data, assigned_to, assigned_at,
  locked_by, locked_until, demo_viewed_count, last_demo_viewed_at, demo_revoked, demo_expires_at,
  status, callback_scheduled_at, call_notes, google_calendar_event_id, opportunity_type, primary_channel, siren, created_at
)
SELECT
  id, company_name, activity, city, phone, email, website_url, google_rating, google_reviews_count,
  audit_data, demo_html, flyer_pdf_url, flyer_pdf_base64, battlecard_data, assigned_to, assigned_at,
  locked_by, locked_until, COALESCE(demo_viewed_count, 0), last_demo_viewed_at, COALESCE(demo_revoked, 0), demo_expires_at,
  status, callback_scheduled_at, call_notes, google_calendar_event_id, COALESCE(opportunity_type, 'website'), primary_channel, siren, created_at
FROM leads;

DROP TABLE leads;
ALTER TABLE leads_new RENAME TO leads;

INSERT INTO lead_contacts (id, lead_id, kind, value, source, confidence, meta, is_primary, created_at)
  SELECT id, lead_id, kind, value, source, confidence, meta, is_primary, created_at FROM lead_contacts_tmp;
DROP TABLE lead_contacts_tmp;
INSERT INTO lead_activities (id, lead_id, user_id, kind, channel, summary, content, created_at)
  SELECT id, lead_id, user_id, kind, channel, summary, content, created_at FROM lead_activities_tmp;
DROP TABLE lead_activities_tmp;

CREATE INDEX IF NOT EXISTS idx_leads_assigned ON leads(assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_leads_status   ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_siren    ON leads(siren);
