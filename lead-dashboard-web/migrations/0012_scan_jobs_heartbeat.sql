-- Migration 0012 — battement du worker sur les jobs (docs/AUDIT_2026-11.md §2.3).
-- ensureAuthSchema ajoute déjà la colonne à chaud ; ce fichier sert d'historique (erreur « duplicate column » = déjà faite).
ALTER TABLE scan_jobs ADD COLUMN heartbeat_at DATETIME;
