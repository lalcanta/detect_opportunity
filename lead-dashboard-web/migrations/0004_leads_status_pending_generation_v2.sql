-- Migration 0004 — 0001 rejouée après la phase 1 : autorise 'pending_generation' en conservant primary_channel.
-- Pour une base dont leads possède déjà la colonne primary_channel (ajoutée par ensureAuthSchema ou 0003).
-- Ne pas utiliser 0001 sur une telle base : elle supprimerait primary_channel.
--
-- Contexte : /api/sync écrit 'pending_generation' pour les leads préparés en mode prep (0 €),
-- mais la contrainte CHECK d'origine ne l'autorisait pas. SQLite ne permet pas de modifier un CHECK :
-- la table est reconstruite à l'identique (même colonnes, mêmes index) avec la nouvelle contrainte.
--
-- Pré-requis : la table leads doit déjà posséder toutes les colonnes listées ci-dessous
-- (vérifier avec : SELECT sql FROM sqlite_master WHERE name = 'leads';).
-- Idempotent en pratique : rejouer la migration reconstruit la table sans perte.
-- lead_contacts.lead_id référence leads(id) : les contacts sont mis de côté pendant la reconstruction puis remis,
-- sinon SQLite garde une violation de clé étrangère (D1 annule alors toute la migration).

PRAGMA defer_foreign_keys = true;

CREATE TABLE lead_contacts_tmp AS SELECT * FROM lead_contacts;
DELETE FROM lead_contacts;

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
  primary_channel      TEXT,
  created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO leads_new (
  id, company_name, activity, city, phone, email, website_url, google_rating, google_reviews_count,
  audit_data, demo_html, flyer_pdf_url, flyer_pdf_base64, battlecard_data, assigned_to, assigned_at,
  locked_by, locked_until, demo_viewed_count, last_demo_viewed_at, demo_revoked, demo_expires_at,
  status, callback_scheduled_at, call_notes, google_calendar_event_id, opportunity_type, primary_channel, created_at
)
SELECT
  id, company_name, activity, city, phone, email, website_url, google_rating, google_reviews_count,
  audit_data, demo_html, flyer_pdf_url, flyer_pdf_base64, battlecard_data, assigned_to, assigned_at,
  locked_by, locked_until, COALESCE(demo_viewed_count, 0), last_demo_viewed_at, COALESCE(demo_revoked, 0), demo_expires_at,
  status, callback_scheduled_at, call_notes, google_calendar_event_id, COALESCE(opportunity_type, 'website'), primary_channel, created_at
FROM leads;

DROP TABLE leads;
ALTER TABLE leads_new RENAME TO leads;

INSERT INTO lead_contacts (id, lead_id, kind, value, source, confidence, meta, is_primary, created_at)
  SELECT id, lead_id, kind, value, source, confidence, meta, is_primary, created_at FROM lead_contacts_tmp;
DROP TABLE lead_contacts_tmp;

CREATE INDEX IF NOT EXISTS idx_leads_assigned ON leads(assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_leads_status   ON leads(status);
