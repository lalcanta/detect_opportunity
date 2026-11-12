-- File d'envoi des emails : envoi par l'application (Resend, Brevo) ou par le worker (SMTP).
CREATE TABLE IF NOT EXISTS email_outbox (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id      TEXT NOT NULL,
  user_id      TEXT,
  provider     TEXT NOT NULL,
  to_email     TEXT NOT NULL,
  subject      TEXT NOT NULL,
  body         TEXT NOT NULL,
  template_id  TEXT,
  status       TEXT NOT NULL DEFAULT 'queued',
  attempts     INTEGER NOT NULL DEFAULT 0,
  error        TEXT,
  message_id   TEXT,
  created_at   TEXT NOT NULL,
  sent_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_email_outbox_status ON email_outbox(status, provider, id);
