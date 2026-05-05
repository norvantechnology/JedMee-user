-- 006_user_sessions.sql
-- Refresh token sessions (one active session per user for now)

CREATE TABLE IF NOT EXISTS user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES app_users(id) ON DELETE CASCADE,
  refresh_token_hash text NOT NULL,
  refresh_token_salt text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS user_sessions_expires_at_idx ON user_sessions (expires_at DESC);

