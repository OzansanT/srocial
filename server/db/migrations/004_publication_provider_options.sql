ALTER TABLE publications
  ADD COLUMN IF NOT EXISTS provider_options JSONB NOT NULL DEFAULT '{}'::jsonb;
