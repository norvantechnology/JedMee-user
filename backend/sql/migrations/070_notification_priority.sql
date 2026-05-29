-- Priority (P1–P4) and category for user_notifications + per-user channel prefs.

ALTER TABLE user_notifications
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'P3',
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'SYSTEM';

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_priority_created
  ON user_notifications (user_id, priority, created_at DESC);

COMMENT ON COLUMN user_notifications.priority IS 'P1=CRITICAL, P2=HIGH, P3=MEDIUM, P4=LOW';
COMMENT ON COLUMN user_notifications.category IS 'INVENTORY | PAYMENT | TRANSACTION | SYSTEM | COMPLIANCE';

-- Per-user notification channel preferences (push / email digest; WhatsApp/SMS reserved).
CREATE TABLE IF NOT EXISTS user_notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL,
  push_enabled boolean NOT NULL DEFAULT true,
  email_digest_enabled boolean NOT NULL DEFAULT true,
  push_critical_only boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_notification_preferences_account
  ON user_notification_preferences (account_id);
