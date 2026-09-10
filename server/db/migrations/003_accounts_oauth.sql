BEGIN;

ALTER TABLE accounts
  ADD COLUMN connection_state text NOT NULL DEFAULT 'DISCONNECTED'
    CHECK (connection_state IN ('DISCONNECTED', 'CONNECTING', 'CONNECTED', 'EXPIRED', 'ERROR')),
  ADD COLUMN username text,
  ADD COLUMN scopes text[] NOT NULL DEFAULT '{}',
  ADD COLUMN connected_at timestamptz,
  ADD COLUMN disconnected_at timestamptz,
  ADD COLUMN last_error_code text;

CREATE TABLE oauth_states (
  id uuid PRIMARY KEY,
  state_hash text NOT NULL UNIQUE,
  provider text NOT NULL CHECK (provider IN ('instagram', 'facebook', 'threads', 'tiktok', 'whatsapp')),
  redirect_uri text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_oauth_states_expiry
  ON oauth_states(expires_at)
  WHERE consumed_at IS NULL;

CREATE INDEX idx_accounts_provider_connection
  ON accounts(platform, connection_state);

COMMIT;
