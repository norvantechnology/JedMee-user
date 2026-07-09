-- 003_app_users.sql
-- Main application users table (tenant-aware).

CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- System role (FK -> roles).
  role_id smallint NOT NULL REFERENCES roles(id),

  full_name text NOT NULL,
  email citext NOT NULL UNIQUE,
  phone_country_code text NOT NULL,
  phone_number text NOT NULL,
  password_hash text NOT NULL,

  -- Email verification & status
  email_verified boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'PENDING',
  is_blocked boolean NOT NULL DEFAULT false,

  -- Tenant/account scoping (account == owner user id)
  account_id uuid NOT NULL,
  created_by_user_id uuid,

  -- First login flow for sub-users
  must_change_password boolean NOT NULL DEFAULT false,

  -- Profile/business fields
  firm_name text,
  address text,
  pin_code text,
  city text,
  state text,
  gst_number text,
  drug_license_1_number text,
  drug_license_2_number text,
  gst_certificate_url text,
  drug_license_1_url text,
  drug_license_2_url text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT app_users_phone_key UNIQUE (phone_country_code, phone_number),
  CONSTRAINT app_users_status_check CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED'))
);

-- Self-references (created_by_user_id) - idempotent guard
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'app_users_created_by_fk'
      AND conrelid = 'app_users'::regclass
  ) THEN
    ALTER TABLE app_users
      ADD CONSTRAINT app_users_created_by_fk
      FOREIGN KEY (created_by_user_id) REFERENCES app_users(id) ON DELETE SET NULL;
  END IF;
END $$;

