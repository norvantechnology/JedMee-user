-- 044_email_verification_otps.sql
-- Stores hashed signup/email verification OTPs (one active row per user).

CREATE TABLE IF NOT EXISTS email_verification_otps (
  user_id uuid NOT NULL PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  otp_hash text NOT NULL,
  otp_salt text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_verification_otps_expires_at_idx ON email_verification_otps (expires_at DESC);
