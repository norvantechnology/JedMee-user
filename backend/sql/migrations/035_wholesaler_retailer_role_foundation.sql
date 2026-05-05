-- 035_wholesaler_retailer_role_foundation.sql
-- Role foundation for WHOLESALER vs RETAILER flows:
-- - Walk-in customer support
-- - Role-aware account settings
-- - Purchase source flag
-- - Retail product/vendor enrichments
-- - Prescription registry

------------------------------------------------------------------------
-- 1) Ensure roles exist
------------------------------------------------------------------------
INSERT INTO roles (code, name)
VALUES
  ('WHOLESALER', 'Wholesaler'),
  ('RETAILER', 'Retailer')
ON CONFLICT (code) DO NOTHING;

------------------------------------------------------------------------
-- 2) Walk-in fields
------------------------------------------------------------------------
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS is_walk_in boolean NOT NULL DEFAULT false;

ALTER TABLE sales_invoices
  ADD COLUMN IF NOT EXISTS is_walk_in_sale boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS walk_in_patient_name text,
  ADD COLUMN IF NOT EXISTS walk_in_patient_phone text,
  ADD COLUMN IF NOT EXISTS walk_in_doctor_name text,
  ADD COLUMN IF NOT EXISTS walk_in_prescription_no text;

------------------------------------------------------------------------
-- 3) Purchase source
------------------------------------------------------------------------
ALTER TABLE purchase_invoices
  ADD COLUMN IF NOT EXISTS purchase_source text NOT NULL DEFAULT 'DIVISION',
  DROP CONSTRAINT IF EXISTS purchase_invoices_purchase_source_check,
  ADD CONSTRAINT purchase_invoices_purchase_source_check
    CHECK (purchase_source IN ('DIVISION', 'VENDOR'));

ALTER TABLE purchase_returns
  ADD COLUMN IF NOT EXISTS purchase_source text NOT NULL DEFAULT 'DIVISION',
  DROP CONSTRAINT IF EXISTS purchase_returns_purchase_source_check,
  ADD CONSTRAINT purchase_returns_purchase_source_check
    CHECK (purchase_source IN ('DIVISION', 'VENDOR'));

-- Backfill by presence of vendor/division fields (if division_id exists in current schema).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'purchase_invoices'
      AND column_name = 'division_id'
  ) THEN
    EXECUTE '
      UPDATE purchase_invoices
      SET purchase_source = CASE
        WHEN division_id IS NOT NULL THEN ''DIVISION''
        ELSE ''VENDOR''
      END
    ';
  ELSE
    UPDATE purchase_invoices
    SET purchase_source = 'VENDOR'
    WHERE vendor_id IS NOT NULL;
  END IF;
END$$;

------------------------------------------------------------------------
-- 4) Product/vendor enrichments for retailer UX/compliance
------------------------------------------------------------------------
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS hsn_code text,
  ADD COLUMN IF NOT EXISTS rack_location text,
  ADD COLUMN IF NOT EXISTS is_otc boolean NOT NULL DEFAULT true;

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS vendor_type text NOT NULL DEFAULT 'WHOLESALER',
  DROP CONSTRAINT IF EXISTS vendors_vendor_type_check,
  ADD CONSTRAINT vendors_vendor_type_check
    CHECK (vendor_type IN ('WHOLESALER', 'DISTRIBUTOR', 'DIRECT_MFG', 'OTHER'));

------------------------------------------------------------------------
-- 5) Account settings (role profile)
------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS account_settings (
  account_id uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  business_type text NOT NULL DEFAULT 'WHOLESALER'
    CHECK (business_type IN ('WHOLESALER', 'RETAILER')),
  default_billing_mode text NOT NULL DEFAULT 'STANDARD'
    CHECK (default_billing_mode IN ('STANDARD', 'QUICK', 'WALK_IN')),
  require_prescription_for_control boolean NOT NULL DEFAULT true,
  show_mrp_on_invoice boolean NOT NULL DEFAULT true,
  allow_sales_above_mrp boolean NOT NULL DEFAULT false,
  default_sales_rate_type text NOT NULL DEFAULT 'SALES_RATE'
    CHECK (default_sales_rate_type IN ('SALES_RATE', 'RETAIL_RATE', 'MRP')),
  auto_create_walk_in_customer boolean NOT NULL DEFAULT false,
  walk_in_customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  print_on_confirm boolean NOT NULL DEFAULT false,
  invoice_header_text text,
  invoice_footer_text text,
  default_stock_warning_days integer NOT NULL DEFAULT 90,
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_account_settings_updated_at ON account_settings;
CREATE TRIGGER trg_account_settings_updated_at
BEFORE UPDATE ON account_settings
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

------------------------------------------------------------------------
-- 6) Prescriptions (retailer compliance)
------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prescriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  sales_invoice_id uuid REFERENCES sales_invoices(id) ON DELETE SET NULL,
  prescription_no text,
  doctor_name text,
  doctor_reg_number text,
  patient_name text NOT NULL,
  patient_age integer,
  patient_phone text,
  prescription_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_customers_walk_in
  ON customers(account_id, is_walk_in)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sales_walk_in
  ON sales_invoices(account_id, is_walk_in_sale);

CREATE INDEX IF NOT EXISTS idx_prescriptions_invoice
  ON prescriptions(sales_invoice_id);

CREATE INDEX IF NOT EXISTS idx_prescriptions_account
  ON prescriptions(account_id, created_at DESC);

------------------------------------------------------------------------
-- 7) Seed account_settings baseline per account by role
------------------------------------------------------------------------
INSERT INTO account_settings (
  account_id,
  business_type,
  default_billing_mode,
  default_sales_rate_type,
  require_prescription_for_control,
  show_mrp_on_invoice,
  auto_create_walk_in_customer
)
SELECT
  u.id,
  CASE WHEN r.code = 'RETAILER' THEN 'RETAILER' ELSE 'WHOLESALER' END AS business_type,
  CASE WHEN r.code = 'RETAILER' THEN 'QUICK' ELSE 'STANDARD' END AS default_billing_mode,
  CASE WHEN r.code = 'RETAILER' THEN 'RETAIL_RATE' ELSE 'SALES_RATE' END AS default_sales_rate_type,
  CASE WHEN r.code = 'RETAILER' THEN true ELSE false END AS require_prescription_for_control,
  true AS show_mrp_on_invoice,
  CASE WHEN r.code = 'RETAILER' THEN true ELSE false END AS auto_create_walk_in_customer
FROM app_users u
JOIN roles r ON r.id = u.role_id
ON CONFLICT (account_id) DO NOTHING;

------------------------------------------------------------------------
-- 8) Create one walk-in customer for each retailer account and link setting
------------------------------------------------------------------------
WITH retailer_accounts AS (
  SELECT u.id AS account_id
  FROM app_users u
  JOIN roles r ON r.id = u.role_id
  WHERE r.code = 'RETAILER'
),
inserted_walkin AS (
  INSERT INTO customers (
    account_id,
    code,
    name,
    short_name,
    customer_type,
    is_cash_customer,
    is_walk_in,
    is_active,
    credit_days,
    credit_limit
  )
  SELECT
    ra.account_id,
    'WALK-IN',
    'Walk-in / Counter Sale',
    'Walk-in',
    'PATIENT'::customer_type_enum,
    true,
    true,
    true,
    0,
    0
  FROM retailer_accounts ra
  WHERE NOT EXISTS (
    SELECT 1
    FROM customers c
    WHERE c.account_id = ra.account_id
      AND c.is_walk_in = true
      AND c.deleted_at IS NULL
  )
  RETURNING id, account_id
),
resolved_walkin AS (
  SELECT i.account_id, i.id AS walk_in_customer_id FROM inserted_walkin i
  UNION ALL
  SELECT c.account_id, c.id AS walk_in_customer_id
  FROM customers c
  JOIN retailer_accounts ra ON ra.account_id = c.account_id
  WHERE c.is_walk_in = true
    AND c.deleted_at IS NULL
)
UPDATE account_settings s
SET
  walk_in_customer_id = rw.walk_in_customer_id,
  business_type = 'RETAILER',
  auto_create_walk_in_customer = true,
  default_billing_mode = 'QUICK',
  default_sales_rate_type = 'RETAIL_RATE'
FROM resolved_walkin rw
WHERE s.account_id = rw.account_id
  AND (s.walk_in_customer_id IS NULL OR s.walk_in_customer_id <> rw.walk_in_customer_id);

------------------------------------------------------------------------
-- 9) Permission resources additions/label alignment
------------------------------------------------------------------------
INSERT INTO permission_resources (resource, display_name, description, sort_order) VALUES
  ('PRESCRIPTIONS', 'Prescriptions', 'Prescription register and audit', 98)
ON CONFLICT (resource) DO UPDATE
SET display_name = EXCLUDED.display_name,
    description  = EXCLUDED.description,
    sort_order   = EXCLUDED.sort_order;
