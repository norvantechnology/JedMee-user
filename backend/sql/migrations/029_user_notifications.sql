-- 029_user_notifications.sql
-- In-app notifications (per user, per account). Supports scheduled jobs + admin broadcasts.

CREATE TABLE IF NOT EXISTS user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  action_label text,
  action_path text,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_created
  ON user_notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_unread
  ON user_notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_notifications_account_created
  ON user_notifications (account_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS user_notifications_dedupe_uidx
  ON user_notifications (account_id, user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;
