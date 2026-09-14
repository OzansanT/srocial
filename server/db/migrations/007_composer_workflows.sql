CREATE TABLE IF NOT EXISTS composer_drafts (
  id uuid PRIMARY KEY,
  user_id uuid NULL,
  name text NOT NULL,
  caption text NOT NULL DEFAULT '',
  scheduled_at timestamptz NULL,
  media jsonb NOT NULL DEFAULT '[]'::jsonb,
  destinations jsonb NOT NULL DEFAULT '[]'::jsonb,
  platform_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS composer_drafts_updated_at_idx
  ON composer_drafts (updated_at DESC);

CREATE TABLE IF NOT EXISTS caption_templates (
  id uuid PRIMARY KEY,
  user_id uuid NULL,
  name text NOT NULL,
  caption text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS caption_templates_name_idx
  ON caption_templates (name);

CREATE TABLE IF NOT EXISTS hashtag_collections (
  id uuid PRIMARY KEY,
  user_id uuid NULL,
  name text NOT NULL,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS hashtag_collections_name_idx
  ON hashtag_collections (name);

CREATE TABLE IF NOT EXISTS destination_groups (
  id uuid PRIMARY KEY,
  user_id uuid NULL,
  name text NOT NULL,
  destinations jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS destination_groups_name_idx
  ON destination_groups (name);

ALTER TABLE publications
  ADD COLUMN IF NOT EXISTS caption_override text NULL,
  ADD COLUMN IF NOT EXISTS media_override jsonb NULL;