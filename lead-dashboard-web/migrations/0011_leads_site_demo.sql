-- Migration 0011 — démo de site complémentaire d'un bilan (servie sur /demos/:id/site).
-- ensureAuthSchema ajoute déjà la colonne à chaud ; ce fichier sert d'historique (erreur « duplicate column » = déjà faite).
ALTER TABLE leads ADD COLUMN site_demo_html TEXT;
