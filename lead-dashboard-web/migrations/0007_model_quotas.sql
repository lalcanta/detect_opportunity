-- Limites gratuites Gemini par modèle, modifiables dans l'admin (doit rester identique à MODEL_QUOTAS_DDL).
CREATE TABLE IF NOT EXISTS model_quotas (
  model       TEXT PRIMARY KEY,
  rpm         INTEGER,
  rpd         INTEGER NOT NULL,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
