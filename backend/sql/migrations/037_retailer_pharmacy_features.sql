-- 037_retailer_pharmacy_features.sql
-- Retailer (pharmacy) feature foundations:
--   • Loose-stock tracking on product_batches (sell tablets out of a strip).
--   • Multiple selling rates per batch: special_rate_1 ("Sp.Rt"), special_rate_2 ("Sl-Sat").
--   • Bill-level rate_type + bill_type on sales_invoices.
--   • Loose-qty + scheme description on sales_invoice_items.
--   • Supplier-product mapping (which vendor supplies which product)  auto-populated on confirmed purchases.
--   • Vendor-manufacturer mapping (one supplier ↔ many manufacturers/divisions).
--   • Non-moving / near-expiry alert tables for ticker.
--   • Retailer settings (loose sale, alert thresholds, default rate/bill type).
--   • inventory_txn_type: LOOSE_SALE / LOOSE_RETURN / BREAK_PACK.
-- Idempotent and safe to re-run.

------------------------------------------------------------------------
-- 1) inventory_txn_type extensions
------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inventory_txn_type') THEN
    BEGIN ALTER TYPE inventory_txn_type ADD VALUE IF NOT EXISTS 'LOOSE_SALE';   EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE inventory_txn_type ADD VALUE IF NOT EXISTS 'LOOSE_RETURN'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE inventory_txn_type ADD VALUE IF NOT EXISTS 'BREAK_PACK';   EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END$$;

------------------------------------------------------------------------
-- 2) product_batches: loose stock + special rates
------------------------------------------------------------------------
ALTER TABLE product_batches
  ADD COLUMN IF NOT EXISTS loose_stock numeric(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loose_unit_name text NOT NULL DEFAULT 'TAB',
  ADD COLUMN IF NOT EXISTS special_rate_1 numeric(10,2),
  ADD COLUMN IF NOT EXISTS special_rate_2 numeric(10,2);

DO $$
BEGIN
  -- loose_stock must be non-negative
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'product_batches_loose_stock_nonneg'
  ) THEN
    ALTER TABLE product_batches
      ADD CONSTRAINT product_batches_loose_stock_nonneg CHECK (loose_stock >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'product_batches_special_rate_1_nonneg'
  ) THEN
    ALTER TABLE product_batches
      ADD CONSTRAINT product_batches_special_rate_1_nonneg CHECK (special_rate_1 IS NULL OR special_rate_1 >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'product_batches_special_rate_2_nonneg'
  ) THEN
    ALTER TABLE product_batches
      ADD CONSTRAINT product_batches_special_rate_2_nonneg CHECK (special_rate_2 IS NULL OR special_rate_2 >= 0);
  END IF;
END$$;

------------------------------------------------------------------------
-- 3) sales_invoices: rate_type (global selling rate) + bill_type
------------------------------------------------------------------------
ALTER TABLE sales_invoices
  ADD COLUMN IF NOT EXISTS rate_type text NOT NULL DEFAULT 'RETAIL_RATE',
  ADD COLUMN IF NOT EXISTS bill_type text NOT NULL DEFAULT 'CASH_MEMO',
  ADD COLUMN IF NOT EXISTS global_discount_percent numeric(5,2) NOT NULL DEFAULT 0;

ALTER TABLE sales_invoices
  DROP CONSTRAINT IF EXISTS sales_invoices_rate_type_check,
  ADD CONSTRAINT sales_invoices_rate_type_check
    CHECK (rate_type IN ('MRP','PURCHASE_RATE','SPECIAL_RATE_1','SPECIAL_RATE_2','SALES_RATE','RETAIL_RATE'));

ALTER TABLE sales_invoices
  DROP CONSTRAINT IF EXISTS sales_invoices_bill_type_check,
  ADD CONSTRAINT sales_invoices_bill_type_check
    CHECK (bill_type IN ('CASH_MEMO','TAX_INVOICE','DEBIT','CREDIT'));

ALTER TABLE sales_invoices
  DROP CONSTRAINT IF EXISTS sales_invoices_global_discount_pct_check,
  ADD CONSTRAINT sales_invoices_global_discount_pct_check
    CHECK (global_discount_percent >= 0 AND global_discount_percent <= 100);

------------------------------------------------------------------------
-- 4) sales_invoice_items: loose qty + scheme desc + line rate snapshot
------------------------------------------------------------------------
ALTER TABLE sales_invoice_items
  ADD COLUMN IF NOT EXISTS loose_qty numeric(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loose_unit_name text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_invoice_items_loose_qty_nonneg'
  ) THEN
    ALTER TABLE sales_invoice_items
      ADD CONSTRAINT sales_invoice_items_loose_qty_nonneg CHECK (loose_qty >= 0);
  END IF;
END$$;

------------------------------------------------------------------------
-- 5) Supplier-Product mapping (which vendor supplies which product)
--    Auto-populated when a vendor-based purchase invoice is confirmed.
------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS supplier_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL,
  product_id uuid NOT NULL,
  typical_purchase_rate numeric(10,2),
  notes text,
  is_preferred boolean NOT NULL DEFAULT false,
  last_supplied_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  CONSTRAINT supplier_products_unique UNIQUE (account_id, vendor_id, product_id)
);

ALTER TABLE supplier_products
  DROP CONSTRAINT IF EXISTS supplier_products_vendor_fk,
  ADD CONSTRAINT supplier_products_vendor_fk
    FOREIGN KEY (account_id, vendor_id)
    REFERENCES vendors(account_id, id)
    ON DELETE CASCADE;

ALTER TABLE supplier_products
  DROP CONSTRAINT IF EXISTS supplier_products_product_fk,
  ADD CONSTRAINT supplier_products_product_fk
    FOREIGN KEY (account_id, product_id)
    REFERENCES products(account_id, id)
    ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_supplier_products_account ON supplier_products(account_id);
CREATE INDEX IF NOT EXISTS idx_supplier_products_vendor  ON supplier_products(account_id, vendor_id);
CREATE INDEX IF NOT EXISTS idx_supplier_products_product ON supplier_products(account_id, product_id);

DROP TRIGGER IF EXISTS trg_supplier_products_updated_at ON supplier_products;
CREATE TRIGGER trg_supplier_products_updated_at
BEFORE UPDATE ON supplier_products
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

------------------------------------------------------------------------
-- 6) Vendor-Manufacturer mapping (one supplier ↔ many manufacturers).
------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendor_manufacturers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL,
  mfg_company_id uuid NOT NULL,
  division_name text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendor_mfg_unique UNIQUE (account_id, vendor_id, mfg_company_id)
);

ALTER TABLE vendor_manufacturers
  DROP CONSTRAINT IF EXISTS vendor_manufacturers_vendor_fk,
  ADD CONSTRAINT vendor_manufacturers_vendor_fk
    FOREIGN KEY (account_id, vendor_id)
    REFERENCES vendors(account_id, id)
    ON DELETE CASCADE;

ALTER TABLE vendor_manufacturers
  DROP CONSTRAINT IF EXISTS vendor_manufacturers_mfg_fk,
  ADD CONSTRAINT vendor_manufacturers_mfg_fk
    FOREIGN KEY (account_id, mfg_company_id)
    REFERENCES mfg_companies(account_id, id)
    ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_vendor_mfg_account ON vendor_manufacturers(account_id);
CREATE INDEX IF NOT EXISTS idx_vendor_mfg_vendor  ON vendor_manufacturers(account_id, vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_mfg_mfg     ON vendor_manufacturers(account_id, mfg_company_id);

------------------------------------------------------------------------
-- 7) Non-moving alerts (recomputed on demand)
------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS non_moving_alerts (
  account_id uuid NOT NULL,
  product_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  last_sale_date date,
  days_non_moving integer NOT NULL DEFAULT 0,
  current_stock numeric(12,3) NOT NULL DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT non_moving_alerts_pkey PRIMARY KEY (account_id, batch_id)
);

CREATE INDEX IF NOT EXISTS idx_non_moving_account ON non_moving_alerts(account_id);
CREATE INDEX IF NOT EXISTS idx_non_moving_days    ON non_moving_alerts(account_id, days_non_moving DESC);

------------------------------------------------------------------------
-- 8) Account settings (retailer)
------------------------------------------------------------------------
ALTER TABLE account_settings
  ADD COLUMN IF NOT EXISTS non_moving_threshold_days integer NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS near_expiry_days          integer NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS enable_loose_sale         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS loose_unit_factor         integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS show_non_moving_ticker    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_near_expiry_ticker   boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS default_bill_type         text    NOT NULL DEFAULT 'CASH_MEMO';

ALTER TABLE account_settings
  DROP CONSTRAINT IF EXISTS account_settings_default_bill_type_check,
  ADD CONSTRAINT account_settings_default_bill_type_check
    CHECK (default_bill_type IN ('CASH_MEMO','TAX_INVOICE'));

-- Broaden default_sales_rate_type to include the retailer rate-type set so a
-- single column can drive both wholesaler and retailer billing defaults.
ALTER TABLE account_settings
  DROP CONSTRAINT IF EXISTS account_settings_default_sales_rate_type_check,
  ADD CONSTRAINT account_settings_default_sales_rate_type_check
    CHECK (default_sales_rate_type IN ('MRP','PURCHASE_RATE','SPECIAL_RATE_1','SPECIAL_RATE_2','SALES_RATE','RETAIL_RATE'));

------------------------------------------------------------------------
-- 9) Helpful indexes for product batch lookup by stock + expiry
------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_product_batches_stock_expiry
  ON product_batches(account_id, product_id, expiry_date)
  WHERE deleted_at IS NULL AND COALESCE(is_hold, false) = false;
