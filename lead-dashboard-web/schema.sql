CREATE TABLE IF NOT EXISTS users (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  email              TEXT UNIQUE,
  password_hash      TEXT,
  invite_code        TEXT UNIQUE,
  invited_at         DATETIME,
  role               TEXT NOT NULL CHECK (role IN ('admin', 'closer')),
  is_active          INTEGER NOT NULL DEFAULT 1,
  phone_quota_weekly INTEGER NOT NULL DEFAULT 100,
  access_token       TEXT NOT NULL UNIQUE,  -- jeton de session interne (cookie HttpOnly)
  google_access_token  TEXT,
  google_refresh_token TEXT,
  google_token_expiry  INTEGER,
  google_calendar_id   TEXT DEFAULT 'primary',
  google_email         TEXT,
  allowed_opportunities TEXT NOT NULL DEFAULT '["website","google_reviews","seo_local","ads_acquisition","custom"]'
);

CREATE TABLE IF NOT EXISTS leads (
  id                   TEXT PRIMARY KEY,
  company_name         TEXT NOT NULL,
  activity             TEXT,
  city                 TEXT,
  phone                TEXT,
  email                TEXT,
  website_url          TEXT,
  google_rating        REAL,
  google_reviews_count INTEGER,
  audit_data           TEXT,            -- JSON
  demo_html            TEXT,
  flyer_pdf_url        TEXT,
  flyer_pdf_base64     TEXT,            -- stockage du PDF (D1 ≤ 2 Mo/ligne ; migrer vers R2 si besoin)
  battlecard_data      TEXT,            -- JSON : callScript, objections, whatsappText
  assigned_to          TEXT REFERENCES users(id),
  assigned_at          DATETIME,
  locked_by            TEXT,
  locked_until         DATETIME,
  demo_viewed_count    INTEGER NOT NULL DEFAULT 0,
  last_demo_viewed_at  DATETIME,
  demo_revoked         INTEGER NOT NULL DEFAULT 0,
  demo_expires_at      DATETIME,
  status               TEXT NOT NULL DEFAULT 'demo_ready'
                       CHECK (status IN ('demo_ready','hot_lead','called','won','lost','callback_scheduled')),
  callback_scheduled_at DATETIME,
  call_notes           TEXT,
  google_calendar_event_id TEXT,
  opportunity_type     TEXT NOT NULL DEFAULT 'website',
  created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_leads_assigned ON leads(assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_leads_status   ON leads(status);

CREATE TABLE IF NOT EXISTS token_usage (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id         TEXT NOT NULL,
  task            TEXT NOT NULL,
  model           TEXT NOT NULL,
  input_tokens    INTEGER NOT NULL DEFAULT 0,
  output_tokens   INTEGER NOT NULL DEFAULT 0,
  thinking_tokens INTEGER NOT NULL DEFAULT 0,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS scan_jobs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  query           TEXT NOT NULL,
  city            TEXT NOT NULL,
  lead_limit      INTEGER NOT NULL DEFAULT 10,
  use_cdp         INTEGER NOT NULL DEFAULT 0,
  lat             REAL,
  lng             REAL,
  radius_km       REAL,
  opportunity_type TEXT NOT NULL DEFAULT 'website',
  website_filter  TEXT NOT NULL DEFAULT 'all',
  execution_mode  TEXT NOT NULL DEFAULT 'full_auto', -- 'full_auto' (cycle complet) ou 'prep_only' (dossier local + prompts pour Antigravity CLI)
  status          TEXT NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued','running','done','failed','cancelled')),
  requested_by    TEXT,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at      DATETIME,
  finished_at     DATETIME,
  processed       INTEGER NOT NULL DEFAULT 0,
  total           INTEGER NOT NULL DEFAULT 0,
  message         TEXT
);

CREATE TABLE IF NOT EXISTS scheduled_scans (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  label           TEXT NOT NULL,
  cron_expr       TEXT NOT NULL,            -- Ex: "30 8 * * 1-5" (Lundi-Vendredi 08h30) ou "0 9 * * *" (Tous les jours 09h00)
  time_of_day     TEXT NOT NULL DEFAULT '08:30', -- Format HH:mm pour affichage simple
  days_of_week    TEXT NOT NULL DEFAULT '1,2,3,4,5', -- 1=Lundi .. 7=Dimanche, ou '*'
  query           TEXT NOT NULL,
  city            TEXT NOT NULL,
  lead_limit      INTEGER NOT NULL DEFAULT 10,
  use_cdp         INTEGER NOT NULL DEFAULT 0,
  lat             REAL,
  lng             REAL,
  radius_km       REAL,
  opportunity_type TEXT NOT NULL DEFAULT 'website',
  website_filter  TEXT NOT NULL DEFAULT 'all',
  execution_mode  TEXT NOT NULL DEFAULT 'full_auto', -- 'full_auto' ou 'prep_only'
  is_active       INTEGER NOT NULL DEFAULT 1,
  last_run_at     DATETIME,
  next_run_at     DATETIME,
  created_by      TEXT,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS model_settings (
  action_type     TEXT PRIMARY KEY,
  provider        TEXT NOT NULL DEFAULT 'gemini',
  model           TEXT NOT NULL DEFAULT 'gemini-3-flash-preview',
  thinking_budget INTEGER NOT NULL DEFAULT 0,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS available_models (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  provider          TEXT NOT NULL,
  model_id          TEXT NOT NULL,
  display_name      TEXT NOT NULL,
  description       TEXT,
  supports_vision   INTEGER NOT NULL DEFAULT 1,
  supports_thinking INTEGER NOT NULL DEFAULT 0,
  is_flagship       INTEGER NOT NULL DEFAULT 1,
  speed             TEXT DEFAULT 'fast',
  cost_tier         TEXT DEFAULT 'eco',
  context_window    TEXT DEFAULT '1M',
  recommended_for   TEXT DEFAULT 'all',
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider, model_id)
);

INSERT OR IGNORE INTO model_settings (action_type, provider, model, thinking_budget) VALUES
  ('demo',       'gemini', 'gemini-3.1-pro-preview', 2048),
  ('audit',      'gemini', 'gemini-3-flash-preview', 0),
  ('battlecard', 'gemini', 'gemini-3-flash-preview', 0);
