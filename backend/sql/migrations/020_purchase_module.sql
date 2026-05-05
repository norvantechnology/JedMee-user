-- 020_purchase_module.sql
-- Phase 2: Purchase module (invoices, returns, vendor payments, price history)

------------------------------------------------------------------------
-- 1) Extend inventory ledger references for document traceability
------------------------------------------------------------------------
ALTER TABLE inventory_txns
  ADD COLUMN IF NOT EXISTS ref_type text,
  ADD COLUMN IF NOT EXISTS ref_id uuid;

CREATE INDEX IF NOT EXISTS idx_inventory_ref_type_id ON inventory_txns(ref_type, ref_id);

------------------------------------------------------------------------
-- 2) Ensure inventory txn enum includes purchase flow types
------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inventory_txn_type') THEN
    BEGIN ALTER TYPE inventory_txn_type ADD VALUE IF NOT EXISTS 'PURCHASE'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE inventory_txn_type ADD VALUE IF NOT EXISTS 'PURCHASE_RETURN'; EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END$$;

------------------------------------------------------------------------
-- 3) Purchase invoices
------------------------------------------------------------------------
-- Composite FKs below reference (account_id, id) on product_batches, so
-- ensure that composite key exists.
CREATE UNIQUE INDEX IF NOT EXISTS product_batches_account_id_id_key
  ON product_batches(account_id, id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'purchase_invoice_status') THEN
    CREATE TYPE purchase_invoice_status AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invoice_payment_status') THEN
    CREATE TYPE invoice_payment_status AS ENUM ('UNPAID', 'PARTIAL', 'PAID');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'purchase_return_status') THEN
    CREATE TYPE purchase_return_status AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'purchase_return_reason') THEN
    CREATE TYPE purchase_return_reason AS ENUM ('DAMAGED', 'EXPIRED', 'EXCESS', 'QUALITY_ISSUE', 'OTHER');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_mode_type') THEN
    CREATE TYPE payment_mode_type AS ENUM ('CASH', 'CHEQUE', 'NEFT', 'UPI', 'OTHER');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS purchase_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  invoice_number text NOT NULL,
  vendor_invoice_number text,
  vendor_id uuid NOT NULL,
  invoice_date date NOT NULL,
  due_date date,
  status purchase_invoice_status NOT NULL DEFAULT 'DRAFT',
  payment_status invoice_payment_status NOT NULL DEFAULT 'UNPAID',
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  total_discount numeric(14,2) NOT NULL DEFAULT 0,
  total_gst numeric(14,2) NOT NULL DEFAULT 0,
  total_amount numeric(14,2) NOT NULL DEFAULT 0,
  amount_paid numeric(14,2) NOT NULL DEFAULT 0,
  balance_due numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  po_id uuid,
  created_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  confirmed_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchase_invoices_non_negative_totals CHECK (
    subtotal >= 0 AND total_discount >= 0 AND total_gst >= 0 AND total_amount >= 0
    AND amount_paid >= 0 AND balance_due >= 0
  )
);

ALTER TABLE purchase_invoices
  DROP CONSTRAINT IF EXISTS purchase_invoices_vendor_fk,
  ADD CONSTRAINT purchase_invoices_vendor_fk
  FOREIGN KEY (account_id, vendor_id)
  REFERENCES vendors(account_id, id)
  ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS purchase_invoices_account_invoice_number_key
  ON purchase_invoices(account_id, lower(invoice_number));
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_account ON purchase_invoices(account_id);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_vendor ON purchase_invoices(vendor_id);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_status ON purchase_invoices(status);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_payment_status ON purchase_invoices(payment_status);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_invoice_date ON purchase_invoices(invoice_date);

------------------------------------------------------------------------
-- 4) Purchase invoice items
------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS purchase_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  purchase_invoice_id uuid NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  product_code text NOT NULL,
  product_name text NOT NULL,
  drug_name text,
  batch_id uuid,
  batch_no text NOT NULL,
  expiry_date date NOT NULL,
  mfg_date date,
  vendor_id uuid,
  mfg_company_id uuid,
  pack text,
  qty numeric(12,3) NOT NULL,
  free_qty numeric(12,3) NOT NULL DEFAULT 0,
  purchase_rate numeric(12,2) NOT NULL,
  mrp numeric(12,2) NOT NULL,
  discount_percent numeric(7,3) NOT NULL DEFAULT 0,
  discount_amount numeric(14,2) NOT NULL DEFAULT 0,
  gst_percent numeric(7,3) NOT NULL DEFAULT 0,
  gst_amount numeric(14,2) NOT NULL DEFAULT 0,
  net_amount numeric(14,2) NOT NULL DEFAULT 0,
  landing_cost numeric(12,2) NOT NULL DEFAULT 0,
  hsn_code text,
  is_new_batch boolean NOT NULL DEFAULT false,
  sales_rate numeric(12,2) NOT NULL DEFAULT 0,
  taxable_amount numeric(14,4) NOT NULL DEFAULT 0,
  line_amount numeric(14,4) NOT NULL DEFAULT 0,
  confirmed_batch_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchase_item_qty_positive CHECK (qty > 0),
  CONSTRAINT purchase_item_free_non_negative CHECK (free_qty >= 0),
  CONSTRAINT purchase_item_rates_valid CHECK (purchase_rate >= 0 AND mrp > 0 AND landing_cost >= 0),
  CONSTRAINT purchase_item_discount_non_negative CHECK (discount_percent >= 0 AND discount_amount >= 0),
  CONSTRAINT purchase_item_gst_non_negative CHECK (gst_percent IN (0,5,12,18,28) AND gst_amount >= 0),
  CONSTRAINT purchase_item_net_non_negative CHECK (net_amount >= 0)
);

ALTER TABLE purchase_invoice_items
  DROP CONSTRAINT IF EXISTS purchase_invoice_items_product_fk,
  ADD CONSTRAINT purchase_invoice_items_product_fk
  FOREIGN KEY (account_id, product_id)
  REFERENCES products(account_id, id)
  ON DELETE RESTRICT;

ALTER TABLE purchase_invoice_items
  DROP CONSTRAINT IF EXISTS purchase_invoice_items_batch_fk,
  ADD CONSTRAINT purchase_invoice_items_batch_fk
  FOREIGN KEY (account_id, batch_id)
  REFERENCES product_batches(account_id, id)
  ON DELETE SET NULL;

ALTER TABLE purchase_invoice_items
  DROP CONSTRAINT IF EXISTS purchase_invoice_items_vendor_fk,
  ADD CONSTRAINT purchase_invoice_items_vendor_fk
  FOREIGN KEY (account_id, vendor_id)
  REFERENCES vendors(account_id, id)
  ON DELETE SET NULL;

ALTER TABLE purchase_invoice_items
  DROP CONSTRAINT IF EXISTS purchase_invoice_items_mfg_fk,
  ADD CONSTRAINT purchase_invoice_items_mfg_fk
  FOREIGN KEY (account_id, mfg_company_id)
  REFERENCES mfg_companies(account_id, id)
  ON DELETE SET NULL;

ALTER TABLE purchase_invoice_items ADD COLUMN IF NOT EXISTS sales_rate numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE purchase_invoice_items ADD COLUMN IF NOT EXISTS taxable_amount numeric(14,4) NOT NULL DEFAULT 0;
ALTER TABLE purchase_invoice_items ADD COLUMN IF NOT EXISTS line_amount numeric(14,4) NOT NULL DEFAULT 0;
ALTER TABLE purchase_invoice_items ADD COLUMN IF NOT EXISTS confirmed_batch_id uuid;

ALTER TABLE purchase_invoice_items
  DROP CONSTRAINT IF EXISTS purchase_invoice_items_confirmed_batch_fk,
  ADD CONSTRAINT purchase_invoice_items_confirmed_batch_fk
  FOREIGN KEY (account_id, confirmed_batch_id)
  REFERENCES product_batches(account_id, id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_items_invoice ON purchase_invoice_items(purchase_invoice_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_product ON purchase_invoice_items(product_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_batch ON purchase_invoice_items(batch_id);

------------------------------------------------------------------------
-- 5) Purchase returns
------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS purchase_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  return_number text NOT NULL,
  purchase_invoice_id uuid NOT NULL REFERENCES purchase_invoices(id) ON DELETE RESTRICT,
  vendor_id uuid NOT NULL,
  return_date date NOT NULL,
  return_reason purchase_return_reason NOT NULL DEFAULT 'OTHER',
  status purchase_return_status NOT NULL DEFAULT 'DRAFT',
  credit_note_number text,
  total_amount numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  created_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  confirmed_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchase_returns_total_non_negative CHECK (total_amount >= 0)
);

ALTER TABLE purchase_returns
  DROP CONSTRAINT IF EXISTS purchase_returns_vendor_fk,
  ADD CONSTRAINT purchase_returns_vendor_fk
  FOREIGN KEY (account_id, vendor_id)
  REFERENCES vendors(account_id, id)
  ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS purchase_returns_account_return_number_key
  ON purchase_returns(account_id, lower(return_number));
CREATE INDEX IF NOT EXISTS idx_purchase_returns_invoice ON purchase_returns(purchase_invoice_id);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_vendor ON purchase_returns(vendor_id);

CREATE TABLE IF NOT EXISTS purchase_return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  purchase_return_id uuid NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
  purchase_invoice_item_id uuid NOT NULL REFERENCES purchase_invoice_items(id) ON DELETE RESTRICT,
  batch_id uuid NOT NULL,
  return_qty numeric(12,3) NOT NULL,
  return_free_qty numeric(12,3) NOT NULL DEFAULT 0,
  return_amount numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchase_return_item_qty_positive CHECK (return_qty > 0),
  CONSTRAINT purchase_return_item_free_non_negative CHECK (return_free_qty >= 0),
  CONSTRAINT purchase_return_item_amount_non_negative CHECK (return_amount >= 0)
);

ALTER TABLE purchase_return_items
  DROP CONSTRAINT IF EXISTS purchase_return_items_batch_fk,
  ADD CONSTRAINT purchase_return_items_batch_fk
  FOREIGN KEY (account_id, batch_id)
  REFERENCES product_batches(account_id, id)
  ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_purchase_return_items_return ON purchase_return_items(purchase_return_id);
CREATE INDEX IF NOT EXISTS idx_purchase_return_items_invoice_item ON purchase_return_items(purchase_invoice_item_id);

------------------------------------------------------------------------
-- 6) Vendor payments
------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendor_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL,
  purchase_invoice_id uuid NOT NULL REFERENCES purchase_invoices(id) ON DELETE RESTRICT,
  payment_date date NOT NULL,
  amount numeric(14,2) NOT NULL,
  payment_mode payment_mode_type NOT NULL DEFAULT 'OTHER',
  reference_number text,
  notes text,
  created_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendor_payment_amount_positive CHECK (amount > 0)
);

ALTER TABLE vendor_payments
  DROP CONSTRAINT IF EXISTS vendor_payments_vendor_fk,
  ADD CONSTRAINT vendor_payments_vendor_fk
  FOREIGN KEY (account_id, vendor_id)
  REFERENCES vendors(account_id, id)
  ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_vendor_payments_invoice ON vendor_payments(purchase_invoice_id);
CREATE INDEX IF NOT EXISTS idx_vendor_payments_vendor ON vendor_payments(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_payments_date ON vendor_payments(payment_date);

------------------------------------------------------------------------
-- 7) Batch price history
------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS batch_price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL,
  purchase_invoice_id uuid REFERENCES purchase_invoices(id) ON DELETE SET NULL,
  purchase_invoice_item_id uuid REFERENCES purchase_invoice_items(id) ON DELETE SET NULL,
  old_mrp numeric(12,2),
  new_mrp numeric(12,2),
  old_purchase_rate numeric(12,2),
  new_purchase_rate numeric(12,2),
  old_sales_rate numeric(12,2),
  new_sales_rate numeric(12,2),
  changed_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  change_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE batch_price_history ADD COLUMN IF NOT EXISTS purchase_invoice_id uuid REFERENCES purchase_invoices(id) ON DELETE SET NULL;
ALTER TABLE batch_price_history ADD COLUMN IF NOT EXISTS old_sales_rate numeric(12,2);
ALTER TABLE batch_price_history ADD COLUMN IF NOT EXISTS new_sales_rate numeric(12,2);

ALTER TABLE batch_price_history
  DROP CONSTRAINT IF EXISTS batch_price_history_batch_fk,
  ADD CONSTRAINT batch_price_history_batch_fk
  FOREIGN KEY (account_id, batch_id)
  REFERENCES product_batches(account_id, id)
  ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_batch_price_history_batch ON batch_price_history(batch_id, created_at DESC);

------------------------------------------------------------------------
-- 8) Updated_at triggers
------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_purchase_invoices_updated_at ON purchase_invoices;
CREATE TRIGGER trg_purchase_invoices_updated_at
BEFORE UPDATE ON purchase_invoices
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_purchase_invoice_items_updated_at ON purchase_invoice_items;
CREATE TRIGGER trg_purchase_invoice_items_updated_at
BEFORE UPDATE ON purchase_invoice_items
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_purchase_returns_updated_at ON purchase_returns;
CREATE TRIGGER trg_purchase_returns_updated_at
BEFORE UPDATE ON purchase_returns
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_purchase_return_items_updated_at ON purchase_return_items;
CREATE TRIGGER trg_purchase_return_items_updated_at
BEFORE UPDATE ON purchase_return_items
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_vendor_payments_updated_at ON vendor_payments;
CREATE TRIGGER trg_vendor_payments_updated_at
BEFORE UPDATE ON vendor_payments
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

------------------------------------------------------------------------
-- 9) Permissions seed for purchase module
------------------------------------------------------------------------
INSERT INTO permission_resources(resource, display_name, description, sort_order) VALUES
  ('PURCHASE_INVOICES', 'Purchase Invoices', 'Create, confirm and manage purchase bills', 60),
  ('PURCHASE_RETURNS',  'Purchase Returns',  'Manage return-to-vendor workflows',         70),
  ('VENDOR_PAYMENTS',   'Vendor Payments',   'Track payment entries against invoices',     80),
  ('PURCHASE_ORDERS',   'Purchase Orders',   'Manage optional pre-purchase POs',          90)
ON CONFLICT (resource) DO UPDATE
SET display_name = EXCLUDED.display_name,
    description  = EXCLUDED.description,
    sort_order   = EXCLUDED.sort_order;
