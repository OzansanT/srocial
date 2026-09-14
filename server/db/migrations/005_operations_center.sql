BEGIN;

ALTER TABLE webhook_events
  ADD COLUMN IF NOT EXISTS signature_valid boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS processing_state text NOT NULL DEFAULT 'RECEIVED',
  ADD COLUMN IF NOT EXISTS error_code text;

CREATE TABLE IF NOT EXISTS provider_status (
  provider text PRIMARY KEY CHECK (provider IN ('instagram','facebook','threads','tiktok')),
  health_state text NOT NULL DEFAULT 'UNKNOWN' CHECK (health_state IN ('UNKNOWN','HEALTHY','DEGRADED','ERROR')),
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error_code text,
  limited_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_publication_attempts_started_at
  ON publication_attempts(started_at DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_events_provider_received_at
  ON webhook_events(provider, received_at DESC);

COMMIT;
