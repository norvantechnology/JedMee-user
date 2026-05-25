-- 067_multi_device_sessions.sql
-- Allow multiple simultaneous sessions per user (multi-device / multi-tab login).
--
-- Previously user_sessions had a UNIQUE constraint on user_id, which meant
-- logging in on a second device would overwrite (and invalidate) the first
-- device's refresh token via ON CONFLICT (user_id) DO UPDATE.
--
-- This migration drops that constraint so each login creates its own row.
-- The application layer (login, refresh, logout) is updated to match sessions
-- by refresh-token hash rather than by user_id alone.

-- 1) Drop the one-session-per-user unique constraint
ALTER TABLE user_sessions
  DROP CONSTRAINT IF EXISTS user_sessions_user_id_key;

-- 2) Add a plain (non-unique) index on user_id so per-user lookups stay fast
CREATE INDEX IF NOT EXISTS user_sessions_user_id_idx
  ON user_sessions (user_id);

-- 3) Tidy up already-expired or revoked sessions from the old single-session era
DELETE FROM user_sessions
WHERE revoked_at IS NOT NULL
   OR expires_at < now() - INTERVAL '7 days';