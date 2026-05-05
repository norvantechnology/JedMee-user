-- 027_mfg_companies_policy_guards.sql
-- Harden mfg company policy columns and soft-delete-safe uniqueness.

-- Normalize nullable finance limits to explicit 0 (0 = unlimited).
UPDATE mfg_companies
SET
  out_bill_limit = COALESCE(out_bill_limit, 0),
  out_day_limit = COALESCE(out_day_limit, 0),
  credit_limit = COALESCE(credit_limit, 0)
WHERE out_bill_limit IS NULL OR out_day_limit IS NULL OR credit_limit IS NULL;

ALTER TABLE mfg_companies
  ALTER COLUMN out_bill_limit SET DEFAULT 0,
  ALTER COLUMN out_day_limit SET DEFAULT 0,
  ALTER COLUMN credit_limit SET DEFAULT 0;

-- Guard rails for numeric values.
ALTER TABLE mfg_companies
  DROP CONSTRAINT IF EXISTS mfg_companies_out_bill_limit_non_negative,
  DROP CONSTRAINT IF EXISTS mfg_companies_out_day_limit_non_negative,
  DROP CONSTRAINT IF EXISTS mfg_companies_credit_limit_non_negative;

ALTER TABLE mfg_companies
  ADD CONSTRAINT mfg_companies_out_bill_limit_non_negative CHECK (out_bill_limit >= 0),
  ADD CONSTRAINT mfg_companies_out_day_limit_non_negative CHECK (out_day_limit >= 0),
  ADD CONSTRAINT mfg_companies_credit_limit_non_negative CHECK (credit_limit >= 0);

-- Self-parent protection.
ALTER TABLE mfg_companies
  DROP CONSTRAINT IF EXISTS mfg_no_self_parent;

ALTER TABLE mfg_companies
  ADD CONSTRAINT mfg_no_self_parent
  CHECK (main_company_id IS NULL OR main_company_id <> id);

-- Ensure canonical partial unique indexes exist (soft delete aware).
CREATE UNIQUE INDEX IF NOT EXISTS mfg_companies_code_unique
  ON mfg_companies(account_id, lower(code))
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS mfg_companies_name_unique
  ON mfg_companies(account_id, lower(name))
  WHERE deleted_at IS NULL;

