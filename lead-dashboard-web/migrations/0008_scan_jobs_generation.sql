-- Jobs de génération par API des leads préparés, et mode réellement exécuté par le worker.
ALTER TABLE scan_jobs ADD COLUMN job_type TEXT NOT NULL DEFAULT 'scan';
ALTER TABLE scan_jobs ADD COLUMN lead_ids TEXT;
ALTER TABLE scan_jobs ADD COLUMN effective_mode TEXT;
