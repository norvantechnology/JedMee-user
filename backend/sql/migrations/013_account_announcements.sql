-- Tenant-wide notice / ad bar (one row per account; account_id = owner user id).

CREATE TABLE IF NOT EXISTS account_announcements (
  account_id uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  message_text text NOT NULL DEFAULT '',
  background_color varchar(32) NOT NULL DEFAULT '#e0f2fe',
  text_color varchar(32) NOT NULL DEFAULT '#0c4a6e',
  button_label varchar(120) NOT NULL DEFAULT '',
  button_url VARCHAR(2048) NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS account_announcements_updated_at_idx ON account_announcements (updated_at DESC);
