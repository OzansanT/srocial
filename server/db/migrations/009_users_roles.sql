CREATE TABLE app_users (
  id uuid PRIMARY KEY,
  username text NOT NULL,
  username_normalized text NOT NULL UNIQUE,
  display_name text,
  role text NOT NULL CHECK (role IN ('ADMIN', 'MANAGER', 'EDITOR', 'VIEWER')),
  status text NOT NULL CHECK (status IN ('ACTIVE', 'DISABLED')),
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE app_user_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);

CREATE INDEX app_user_sessions_user_id_idx ON app_user_sessions(user_id);
CREATE INDEX app_user_sessions_expires_at_idx ON app_user_sessions(expires_at);
CREATE INDEX app_user_sessions_active_lookup_idx ON app_user_sessions(token_hash, expires_at) WHERE revoked_at IS NULL;
