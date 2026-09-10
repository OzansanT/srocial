BEGIN;

CREATE TABLE users (
  id uuid PRIMARY KEY,
  email text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE accounts (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('instagram','facebook','threads','tiktok','whatsapp')),
  provider_account_id text,
  display_name text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  connected boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(platform, provider_account_id)
);

CREATE TABLE posts (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  caption text NOT NULL,
  scheduled_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE media (
  id uuid PRIMARY KEY,
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('image','video','document')),
  url text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE publications (
  id uuid PRIMARY KEY,
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  platform text NOT NULL CHECK (platform IN ('instagram','facebook','threads','tiktok')),
  state text NOT NULL,
  scheduled_at timestamptz NOT NULL,
  external_id text,
  external_url text,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE publication_attempts (
  id uuid PRIMARY KEY,
  publication_id uuid NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  attempt integer NOT NULL,
  state text NOT NULL,
  provider_error_code text,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE(publication_id, attempt)
);

CREATE TABLE contacts (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  phone_number text NOT NULL,
  display_name text,
  consent_status text NOT NULL DEFAULT 'unknown',
  consent_source text,
  consent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, phone_number)
);

CREATE TABLE contact_lists (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE contact_list_members (
  list_id uuid NOT NULL REFERENCES contact_lists(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  PRIMARY KEY(list_id, contact_id)
);

CREATE TABLE whatsapp_templates (
  id uuid PRIMARY KEY,
  account_id uuid REFERENCES accounts(id) ON DELETE CASCADE,
  provider_template_id text,
  name text NOT NULL,
  language text NOT NULL,
  category text,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE campaigns (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  template_id uuid REFERENCES whatsapp_templates(id) ON DELETE SET NULL,
  name text NOT NULL,
  state text NOT NULL,
  scheduled_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE campaign_recipients (
  id uuid PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'QUEUED',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, contact_id)
);

CREATE TABLE whatsapp_messages (
  id uuid PRIMARY KEY,
  campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  campaign_recipient_id uuid REFERENCES campaign_recipients(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  provider_message_id text,
  state text NOT NULL,
  error_code text,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE webhook_events (
  id uuid PRIMARY KEY,
  provider text NOT NULL,
  external_event_id text,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE(provider, external_event_id)
);

CREATE TABLE scheduler_jobs (
  id uuid PRIMARY KEY,
  type text NOT NULL,
  publication_id uuid REFERENCES publications(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE,
  state text NOT NULL,
  scheduled_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  locked_at timestamptz,
  locked_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (publication_id IS NOT NULL OR campaign_id IS NOT NULL)
);

CREATE INDEX idx_posts_scheduled_at ON posts(scheduled_at);
CREATE INDEX idx_publications_state_schedule ON publications(state, scheduled_at);
CREATE INDEX idx_scheduler_jobs_state_schedule ON scheduler_jobs(state, scheduled_at);
CREATE INDEX idx_scheduler_jobs_lock ON scheduler_jobs(locked_at) WHERE locked_at IS NOT NULL;
CREATE INDEX idx_whatsapp_messages_provider_id ON whatsapp_messages(provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE INDEX idx_webhook_events_received_at ON webhook_events(received_at);
CREATE INDEX idx_campaigns_state_schedule ON campaigns(state, scheduled_at);

COMMIT;
