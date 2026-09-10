BEGIN;

ALTER TABLE accounts
  ADD COLUMN scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN connection_mode text;

CREATE INDEX idx_accounts_platform_connected
  ON accounts(platform, connected);

CREATE TABLE oauth_states (
  id uuid PRIMARY KEY,
  provider text NOT NULL CHECK (provider IN ('instagram','facebook','threads','tiktok','whatsapp')),
  state_hash text NOT NULL CHECK (length(state_hash) = 64),
  return_to text NOT NULL DEFAULT '/',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  UNIQUE(provider, state_hash)
);

CREATE INDEX idx_oauth_states_lookup
  ON oauth_states(provider, state_hash)
  WHERE consumed_at IS NULL;

CREATE INDEX idx_oauth_states_expires_at
  ON oauth_states(expires_at);

COMMENT ON COLUMN oauth_states.state_hash IS
  'SHA-256 hash of OAuth state. Raw OAuth state values must never be persisted.';

COMMIT;
