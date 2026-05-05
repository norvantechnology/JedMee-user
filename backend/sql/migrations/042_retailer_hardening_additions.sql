-- Additional production hardening:
-- - explicit audit log table
-- - ensure modern payment modes exist in enums

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE', 'CONFIRM', 'CANCEL')),
  old_values JSONB,
  new_values JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_record ON audit_log(account_id, table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(account_id, user_id, created_at DESC);

DO $$
BEGIN
  BEGIN
    ALTER TYPE customer_payment_mode_type ADD VALUE IF NOT EXISTS 'IMPS';
  EXCEPTION WHEN undefined_object THEN
    NULL;
  END;
  BEGIN
    ALTER TYPE payment_mode_type ADD VALUE IF NOT EXISTS 'CARD';
  EXCEPTION WHEN undefined_object THEN
    NULL;
  END;
END $$;
