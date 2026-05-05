-- 016_mfg_companies.sql
-- Manufacturing Company (Mfg Company) management (account scoped)

CREATE TABLE IF NOT EXISTS mfg_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,

  code text NOT NULL,
  name text NOT NULL,
  short_name text,
  rack_no text,

  -- Optional company-level protection password (stored hashed)
  password_hash text,

  -- Optional grouping
  main_company_id uuid REFERENCES mfg_companies(id) ON DELETE SET NULL,

  -- Email configuration (multiple emails)
  mr_emails text[] NOT NULL DEFAULT '{}',
  cf_emails text[] NOT NULL DEFAULT '{}',
  mfg_emails text[] NOT NULL DEFAULT '{}',
  other_emails text[] NOT NULL DEFAULT '{}',

  -- Access & operational locks
  sale_lock boolean NOT NULL DEFAULT false,
  purchase_order_lock boolean NOT NULL DEFAULT false,
  stock_report_lock boolean NOT NULL DEFAULT false,

  -- Sales restrictions
  prevent_free_qty boolean NOT NULL DEFAULT false,
  prevent_discount boolean NOT NULL DEFAULT false,
  prevent_net_rate boolean NOT NULL DEFAULT false,
  prevent_return_product boolean NOT NULL DEFAULT false,
  prevent_expiry_damage_product boolean NOT NULL DEFAULT false,

  -- Financial controls
  out_bill_limit int,
  out_day_limit int,
  credit_limit numeric(14,2),

  created_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- Soft-delete friendly uniqueness
DROP INDEX IF EXISTS mfg_companies_account_code_key;
DROP INDEX IF EXISTS mfg_companies_account_name_key;

CREATE UNIQUE INDEX IF NOT EXISTS mfg_companies_account_code_key
  ON mfg_companies (account_id, lower(code))
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS mfg_companies_account_name_key
  ON mfg_companies (account_id, lower(name))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS mfg_companies_account_main_idx
  ON mfg_companies (account_id, main_company_id)
  WHERE deleted_at IS NULL;

-- Seed permission resource for RBAC
INSERT INTO permission_resources(resource)
VALUES ('MFG_COMPANIES')
ON CONFLICT (resource) DO NOTHING;

