-- Migration 069: FCM device tokens for push notifications
-- Stores one or more FCM tokens per user (multi-device support).
-- Tokens are upserted on login and cleaned up when FCM rejects them.

CREATE TABLE IF NOT EXISTS fcm_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  account_id    UUID NOT NULL,
  token         TEXT NOT NULL,
  device_type   TEXT NOT NULL DEFAULT 'android', -- android | ios | web
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fcm_tokens_token_unique UNIQUE (token)
);

CREATE INDEX IF NOT EXISTS fcm_tokens_user_id_idx ON fcm_tokens (user_id);
CREATE INDEX IF NOT EXISTS fcm_tokens_account_id_idx ON fcm_tokens (account_id);

COMMENT ON TABLE fcm_tokens IS 'FCM device tokens for push notifications. One row per device token.';
COMMENT ON COLUMN fcm_tokens.device_type IS 'android | ios | web';