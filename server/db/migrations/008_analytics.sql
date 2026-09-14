CREATE TABLE IF NOT EXISTS publication_metric_snapshots (
  id uuid PRIMARY KEY,
  publication_id uuid NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  account_id uuid NULL REFERENCES accounts(id) ON DELETE SET NULL,
  provider text NOT NULL CHECK (provider IN ('instagram', 'facebook', 'threads', 'tiktok')),
  external_id text NOT NULL,
  views bigint NULL CHECK (views IS NULL OR views >= 0),
  reach bigint NULL CHECK (reach IS NULL OR reach >= 0),
  likes bigint NULL CHECK (likes IS NULL OR likes >= 0),
  comments bigint NULL CHECK (comments IS NULL OR comments >= 0),
  shares bigint NULL CHECK (shares IS NULL OR shares >= 0),
  saves bigint NULL CHECK (saves IS NULL OR saves >= 0),
  extra_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  captured_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS publication_metric_snapshots_publication_captured_idx
  ON publication_metric_snapshots (publication_id, captured_at DESC);

CREATE INDEX IF NOT EXISTS publication_metric_snapshots_provider_captured_idx
  ON publication_metric_snapshots (provider, captured_at DESC);

CREATE INDEX IF NOT EXISTS publication_metric_snapshots_account_captured_idx
  ON publication_metric_snapshots (account_id, captured_at DESC);
