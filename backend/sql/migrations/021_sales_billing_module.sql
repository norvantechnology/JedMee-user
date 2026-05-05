-- 021_sales_billing_module.sql
-- Phase 3: Customers + Sales & Billing + Sales Returns + Customer Payments

------------------------------------------------------------------------
-- 1) Ensure inventory ledger ref columns exist
------------------------------------------------------------------------
ALTER TABLE inventory_txns
  ADD COLUMN IF NOT EXISTS ref_type text,
  ADD COLUMN IF NOT EXISTS ref_id uuid;

CREATE INDEX IF NOT EXISTS idx_inventory_txns_ref_type_id ON inventory_txns(ref_type, ref_id);

------------------------------------------------------------------------
-- 2) Ensure txn enum contains sales variants
------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inventory_txn_type') THEN
    BEGIN ALTER TYPE inventory_txn_type ADD VALUE IF NOT EXISTS 'SALE'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE inventory_txn_type ADD VALUE IF NOT EXISTS 'SALE_RETURN'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE inventory_txn_type ADD VALUE IF NOT EXISTS 'SALE_CANCELLATION'; EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END$$;

------------------------------------------------------------------------
-- 3) Types used by sales module
------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'customer_type_enum') THEN
    CREATE TYPE customer_type_enum AS ENUM ('RETAILER', 'HOSPITAL', 'CLINIC', 'DISTRIBUTOR', 'PATIENT', 'OTHER');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sales_invoice_status') THEN
    CREATE TYPE sales_invoice_status AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sales_payment_status') THEN
    CREATE TYPE sales_payment_status AS ENUM ('UNPAID', 'PARTIAL', 'PAID');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sales_return_status') THEN
    CREATE TYPE sales_return_status AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sales_return_reason') THEN
    CREATE TYPE sales_return_reason AS ENUM ('EXPIRED', 'DAMAGED', 'WRONG_PRODUCT', 'EXCESS', 'PATIENT_RETURNED', 'OTHER');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'customer_payment_mode_type') THEN
    CREATE TYPE customer_payment_mode_type AS ENUM ('CASH', 'CHEQUE', 'NEFT', 'UPI', 'CARD', 'OTHER');
  END IF;
END$$;

------------------------------------------------------------------------
-- 4) Customers
------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  short_name text,
  phone_country_code text DEFAULT '+91',
  phone_number text,
  email text,
  address text,
  city text,
  state text,
  pincode text,
  customer_type customer_type_enum NOT NULL DEFAULT 'RETAILER',
  gst_number text,
  drug_license_number text,
  dl_expiry_date date,
  credit_days integer NOT NULL DEFAULT 0,
  credit_limit numeric(12,2) NOT NULL DEFAULT 0,
  discount_percent numeric(5,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_cash_customer boolean NOT NULL DEFAULT false,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  CONSTRAINT customers_credit_days_non_negative CHECK (credit_days >= 0),
  CONSTRAINT customers_credit_limit_non_negative CHECK (credit_limit >= 0),
  CONSTRAINT customers_discount_range CHECK (discount_percent >= 0 AND discount_percent <= 100)
);

CREATE UNIQUE INDEX IF NOT EXISTS customers_code_unique
  ON customers(account_id, lower(code))
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS customers_name_unique
  ON customers(account_id, lower(name))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_customers_account
  ON customers(account_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_customers_type
  ON customers(account_id, customer_type)
  WHERE deleted_at IS NULL;

------------------------------------------------------------------------
-- 5) Sales invoices
------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  invoice_number text NOT NULL,
  customer_id uuid NOT NULL REFERENCES customers(id),
  customer_name text NOT NULL,
  customer_gst text,
  customer_drug_license text,
  invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  status sales_invoice_status NOT NULL DEFAULT 'DRAFT',
  payment_status sales_payment_status NOT NULL DEFAULT 'UNPAID',
  subtotal numeric(12,4) NOT NULL DEFAULT 0,
  total_discount numeric(12,4) NOT NULL DEFAULT 0,
  total_gst numeric(12,4) NOT NULL DEFAULT 0,
  total_amount numeric(12,4) NOT NULL DEFAULT 0,
  amount_paid numeric(12,4) NOT NULL DEFAULT 0,
  balance_due numeric(12,4) NOT NULL DEFAULT 0,
  round_off numeric(6,4) NOT NULL DEFAULT 0,
  notes text,
  cancel_reason text,
  cancelled_at timestamptz,
  cancelled_by_user_id uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES app_users(id),
  confirmed_by_user_id uuid REFERENCES app_users(id),
  confirmed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS sales_invoices_number_unique
  ON sales_invoices(account_id, invoice_number);
CREATE INDEX IF NOT EXISTS idx_sales_account ON sales_invoices(account_id);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales_invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales_invoices(account_id, invoice_date);
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales_invoices(account_id, status, payment_status);

------------------------------------------------------------------------
-- 6) Sales invoice items
------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  sales_invoice_id uuid NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  product_code text NOT NULL,
  product_name text NOT NULL,
  drug_name text,
  batch_id uuid NOT NULL,
  batch_no text NOT NULL,
  expiry_date date NOT NULL,
  mfg_company_id uuid,
  mfg_company_name text,
  qty integer NOT NULL CHECK (qty > 0),
  free_qty integer NOT NULL DEFAULT 0 CHECK (free_qty >= 0),
  mrp numeric(10,2) NOT NULL,
  sales_rate numeric(10,2) NOT NULL,
  discount_percent numeric(5,2) NOT NULL DEFAULT 0,
  discount_amount numeric(10,4) NOT NULL DEFAULT 0,
  net_rate numeric(10,2) NOT NULL DEFAULT 0,
  gst_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (gst_percent IN (0, 5, 12, 18, 28)),
  gst_amount numeric(10,4) NOT NULL DEFAULT 0,
  taxable_amount numeric(10,4) NOT NULL DEFAULT 0,
  line_total numeric(10,4) NOT NULL DEFAULT 0,
  scheme_description text,
  prescription_no text,
  doctor_name text,
  patient_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE sales_invoice_items
  DROP CONSTRAINT IF EXISTS sales_invoice_items_product_fk,
  ADD CONSTRAINT sales_invoice_items_product_fk
  FOREIGN KEY (account_id, product_id)
  REFERENCES products(account_id, id)
  ON DELETE RESTRICT;

ALTER TABLE sales_invoice_items
  DROP CONSTRAINT IF EXISTS sales_invoice_items_batch_fk,
  ADD CONSTRAINT sales_invoice_items_batch_fk
  FOREIGN KEY (account_id, batch_id)
  REFERENCES product_batches(account_id, id)
  ON DELETE RESTRICT;

ALTER TABLE sales_invoice_items
  DROP CONSTRAINT IF EXISTS sales_invoice_items_mfg_fk,
  ADD CONSTRAINT sales_invoice_items_mfg_fk
  FOREIGN KEY (account_id, mfg_company_id)
  REFERENCES mfg_companies(account_id, id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sales_items_invoice ON sales_invoice_items(sales_invoice_id);
CREATE INDEX IF NOT EXISTS idx_sales_items_batch ON sales_invoice_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_sales_items_product ON sales_invoice_items(product_id);

------------------------------------------------------------------------
-- 7) Sales returns
------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  return_number text NOT NULL,
  sales_invoice_id uuid REFERENCES sales_invoices(id),
  customer_id uuid NOT NULL REFERENCES customers(id),
  customer_name text NOT NULL,
  return_date date NOT NULL DEFAULT CURRENT_DATE,
  return_reason sales_return_reason NOT NULL DEFAULT 'OTHER',
  status sales_return_status NOT NULL DEFAULT 'DRAFT',
  total_return_amount numeric(12,4) NOT NULL DEFAULT 0,
  notes text,
  cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES app_users(id),
  confirmed_by_user_id uuid REFERENCES app_users(id),
  confirmed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS sales_returns_number_unique
  ON sales_returns(account_id, return_number);
CREATE INDEX IF NOT EXISTS idx_sales_returns_account ON sales_returns(account_id);
CREATE INDEX IF NOT EXISTS idx_sales_returns_customer ON sales_returns(customer_id);

CREATE TABLE IF NOT EXISTS sales_return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  sales_return_id uuid NOT NULL REFERENCES sales_returns(id) ON DELETE CASCADE,
  sales_invoice_item_id uuid REFERENCES sales_invoice_items(id),
  product_id uuid NOT NULL,
  product_name text NOT NULL,
  batch_id uuid NOT NULL,
  batch_no text NOT NULL,
  expiry_date date NOT NULL,
  mfg_company_id uuid,
  return_qty integer NOT NULL CHECK (return_qty > 0),
  return_free_qty integer NOT NULL DEFAULT 0,
  sales_rate numeric(10,2) NOT NULL,
  net_rate numeric(10,2) NOT NULL,
  return_amount numeric(10,4) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE sales_return_items
  DROP CONSTRAINT IF EXISTS sales_return_items_product_fk,
  ADD CONSTRAINT sales_return_items_product_fk
  FOREIGN KEY (account_id, product_id)
  REFERENCES products(account_id, id)
  ON DELETE RESTRICT;

ALTER TABLE sales_return_items
  DROP CONSTRAINT IF EXISTS sales_return_items_batch_fk,
  ADD CONSTRAINT sales_return_items_batch_fk
  FOREIGN KEY (account_id, batch_id)
  REFERENCES product_batches(account_id, id)
  ON DELETE RESTRICT;

ALTER TABLE sales_return_items
  DROP CONSTRAINT IF EXISTS sales_return_items_mfg_fk,
  ADD CONSTRAINT sales_return_items_mfg_fk
  FOREIGN KEY (account_id, mfg_company_id)
  REFERENCES mfg_companies(account_id, id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_return_items_return ON sales_return_items(sales_return_id);
CREATE INDEX IF NOT EXISTS idx_return_items_batch ON sales_return_items(batch_id);

------------------------------------------------------------------------
-- 8) Customer payments
------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id),
  sales_invoice_id uuid REFERENCES sales_invoices(id),
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric(12,4) NOT NULL CHECK (amount > 0),
  payment_mode customer_payment_mode_type NOT NULL DEFAULT 'CASH',
  reference_number text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES app_users(id)
);

CREATE INDEX IF NOT EXISTS idx_cust_payments_customer ON customer_payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_cust_payments_invoice ON customer_payments(sales_invoice_id);

------------------------------------------------------------------------
-- 9) Updated_at triggers
------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_customers_updated_at ON customers;
CREATE TRIGGER trg_customers_updated_at
BEFORE UPDATE ON customers
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_sales_invoices_updated_at ON sales_invoices;
CREATE TRIGGER trg_sales_invoices_updated_at
BEFORE UPDATE ON sales_invoices
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_sales_returns_updated_at ON sales_returns;
CREATE TRIGGER trg_sales_returns_updated_at
BEFORE UPDATE ON sales_returns
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

------------------------------------------------------------------------
-- 10) Permission resources for Phase 3
------------------------------------------------------------------------
INSERT INTO permission_resources(resource, display_name, description, sort_order) VALUES
  ('CUSTOMERS',         'Customers',         'Manage customer master',               55),
  ('SALES_INVOICES',    'Sales & Billing',   'Create and manage sales invoices',     95),
  ('SALES_RETURNS',     'Sales Returns',     'Process sales returns',               100),
  ('CUSTOMER_PAYMENTS', 'Customer Payments', 'Record and view customer payments',    105)
ON CONFLICT (resource) DO UPDATE
SET display_name = EXCLUDED.display_name,
    description  = EXCLUDED.description,
    sort_order   = EXCLUDED.sort_order;
