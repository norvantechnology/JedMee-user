-- 008_vendors.sql
-- Vendors (account scoped) with structured phone

CREATE TABLE IF NOT EXISTS vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  short_name text,
  rack_number text,
  main_company text,
  phone_country_code text,
  phone_number text,
  email text,
  address text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unique vendor code within an account (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS vendors_account_code_key ON vendors (account_id, lower(code));
CREATE INDEX IF NOT EXISTS vendors_account_created_at_idx ON vendors (account_id, created_at DESC);

