CREATE TABLE rate_limit_buckets (
  scope text NOT NULL,
  client_key text NOT NULL,
  window_start_ms bigint NOT NULL,
  request_count integer NOT NULL CHECK (request_count >= 0),
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (scope, client_key)
);

CREATE INDEX rate_limit_buckets_updated_at_idx ON rate_limit_buckets(updated_at);
