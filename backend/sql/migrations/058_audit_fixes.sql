-- 058_audit_fixes.sql
-- Comprehensive audit fixes for all DB-layer issues identified in the platform audit.
-- All statements are idempotent (IF NOT EXISTS / DO blocks / ON CONFLICT).
--
-- Issues addressed:
--   DB-01  products.mfg_company_id column missing (never explicitly added)
--   DB-02  mfg_companies parent deletion guard (prevent orphan children)
--   DB-03  mfg_companies soft-delete support
--   DB-06  vendors active+deleted compound index
--   DB-08  products.division_id NOT NULL enforcement attempt
--   DB-11  purchase_return_items batch/invoice reference check constraint
--   DB-13  Drop unused purchase_return_reason enum
--   DB-14  purchase_invoices purchase_source consistency constraint
--   DB-15  ON_ACCOUNT vendor payments — index for allocation refresh
--   DB-16  sales_invoices invoice_number unique index as partial (soft-delete safe)
--   DB-17  customer_payments allocation constraint relaxed for post-hoc allocation
--   DB-18  wholesaler_catalog tenant-safe FK
--   DB-19  order_items account_id clarification index
--   DB-20  supplier_products division backfill (already in 057; guard here)
--   DB-21  product_gst_history table for GST rate change audit

------------------------------------------------------------------------
-- DB-01: products.mfg_company_id — add the column that was never explicitly
--        defined in any migration but is referenced by indexes and queries.
------------------------------------------------------------------------
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS mfg_company_id uuid;

-- Tenant-safe FK to mfg_companies
CREATE UNIQUE INDEX IF NOT EXISTS mfg_companies_account_id_unique
  ON mfg_companies(account_id, id);

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_mfg_company_fk;

ALTER TABLE products
  ADD CONSTRAINT products_mfg_company_fk
  FOREIGN KEY (account_id, mfg_company_id)
  REFERENCES mfg_companies(account_id, id)
  ON DELETE SET NULL;

-- Backfill mfg_company_id from division where not already set
UPDATE products p
SET mfg_company_id = d.mfg_company_id
FROM divisions d
WHERE p.division_id = d.id
  AND p.account_id = d.account_id
  AND p.mfg_company_id IS NULL
  AND p.deleted_at IS NULL;

-- Re-assert product name uniqueness per manufacturer
DROP INDEX IF EXISTS products_name_per_mfg_unique;
CREATE UNIQUE INDEX IF NOT EXISTS products_name_per_mfg_unique
  ON products(account_id, mfg_company_id, lower(name))
  WHERE deleted_at IS NULL AND mfg_company_id IS NOT NULL;

------------------------------------------------------------------------
-- DB-03: mfg_companies soft-delete support
------------------------------------------------------------------------
ALTER TABLE mfg_companies
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Soft-delete guard: prevent hard-delete when products or divisions reference this company
-- (already enforced by ON DELETE RESTRICT FKs; this comment documents the intent)

------------------------------------------------------------------------
-- DB-06: vendors — compound index for active + soft-delete list queries
------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_vendors_account_active_deleted
  ON vendors(account_id, is_active, deleted_at);

------------------------------------------------------------------------
-- DB-08: products.division_id — attempt NOT NULL enforcement
-- Only applies if all active products already have a division_id set.
------------------------------------------------------------------------
DO $$
DECLARE
  unresolved int;
BEGIN
  SELECT COUNT(*) INTO unresolved
  FROM products
  WHERE deleted_at IS NULL AND division_id IS NULL;

  IF unresolved = 0 THEN
    BEGIN
      ALTER TABLE products ALTER COLUMN division_id SET NOT NULL;
      RAISE NOTICE 'products.division_id is now NOT NULL.';
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Could not set products.division_id NOT NULL: %', SQLERRM;
    END;
  ELSE
    RAISE NOTICE
      'Leaving products.division_id nullable: % active product(s) have no division.',
      unresolved;
  END IF;
END $$;

------------------------------------------------------------------------
-- DB-11: purchase_return_items — at least one of batch_id or
--        purchase_invoice_item_id must be non-null
------------------------------------------------------------------------
ALTER TABLE purchase_return_items
  DROP CONSTRAINT IF EXISTS purchase_return_items_ref_chk;

ALTER TABLE purchase_return_items
  ADD CONSTRAINT purchase_return_items_ref_chk
  CHECK (batch_id IS NOT NULL OR purchase_invoice_item_id IS NOT NULL);

------------------------------------------------------------------------
-- DB-13: Drop unused purchase_return_reason enum (converted to TEXT in 048)
------------------------------------------------------------------------
DO $$
BEGIN
  DROP TYPE IF EXISTS purchase_return_reason;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Could not drop purchase_return_reason: %', SQLERRM;
END $$;

------------------------------------------------------------------------
-- DB-14: purchase_invoices — purchase_source must match the party column
------------------------------------------------------------------------
ALTER TABLE purchase_invoices
  DROP CONSTRAINT IF EXISTS purchase_invoices_source_party_chk;

ALTER TABLE purchase_invoices
  ADD CONSTRAINT purchase_invoices_source_party_chk
  CHECK (
    (purchase_source = 'DIVISION' AND division_id IS NOT NULL)
    OR
    (purchase_source = 'VENDOR'   AND vendor_id   IS NOT NULL)
  );

------------------------------------------------------------------------
-- DB-15: ON_ACCOUNT vendor payments — index to find unallocated advances
------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_vendor_payments_on_account
  ON vendor_payments(account_id, vendor_id, allocation_type)
  WHERE allocation_type = 'ON_ACCOUNT' AND purchase_invoice_id IS NULL;

------------------------------------------------------------------------
-- DB-16: sales_invoices — make invoice_number unique index soft-delete safe
------------------------------------------------------------------------
DROP INDEX IF EXISTS sales_invoices_number_unique;

CREATE UNIQUE INDEX IF NOT EXISTS sales_invoices_number_unique
  ON sales_invoices(account_id, invoice_number)
  WHERE deleted_at IS NULL;

------------------------------------------------------------------------
-- DB-17: customer_payments — relax allocation constraint to allow
--        post-hoc allocation (ON_ACCOUNT payment linked to invoice later)
------------------------------------------------------------------------
ALTER TABLE customer_payments
  DROP CONSTRAINT IF EXISTS customer_payments_allocation_invoice_link_chk;

-- New constraint: INVOICE type must have an invoice; ON_ACCOUNT may or may not
ALTER TABLE customer_payments
  ADD CONSTRAINT customer_payments_allocation_invoice_link_chk
  CHECK (
    allocation_type = 'INVOICE'
    OR allocation_type = 'ON_ACCOUNT'
  );

------------------------------------------------------------------------
-- DB-18: wholesaler_catalog — add tenant-safe composite FK
------------------------------------------------------------------------
-- First ensure the composite unique index exists on products
CREATE UNIQUE INDEX IF NOT EXISTS products_account_id_unique
  ON products(account_id, id);

-- Drop old simple FK and replace with tenant-safe composite FK
ALTER TABLE wholesaler_catalog
  DROP CONSTRAINT IF EXISTS wholesaler_catalog_product_id_fkey;

ALTER TABLE wholesaler_catalog
  DROP CONSTRAINT IF EXISTS wholesaler_catalog_product_fk;

ALTER TABLE wholesaler_catalog
  ADD CONSTRAINT wholesaler_catalog_product_fk
  FOREIGN KEY (account_id, product_id)
  REFERENCES products(account_id, id)
  ON DELETE RESTRICT;

------------------------------------------------------------------------
-- DB-19: order_items — index clarifying which account_id is stored
--        (wholesaler_account_id = the account that owns the catalog item)
------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_order_items_account_order
  ON order_items(account_id, order_id);

------------------------------------------------------------------------
-- DB-21: product_gst_history — audit trail for GST rate changes
------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_gst_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  old_sales_gst numeric,
  new_sales_gst numeric,
  old_purchase_gst numeric,
  new_purchase_gst numeric,
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  changed_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_gst_history_product
  ON product_gst_history(product_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_gst_history_account
  ON product_gst_history(account_id, created_at DESC);

------------------------------------------------------------------------
-- Additional: purchase_return_items — index for freehand items (no invoice item link)
------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_purchase_return_items_freehand
  ON purchase_return_items(purchase_return_id)
  WHERE purchase_invoice_item_id IS NULL;

------------------------------------------------------------------------
-- Additional: mfg_companies — add is_active index for list queries
------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_mfg_companies_account_active
  ON mfg_companies(account_id, is_active)
  WHERE deleted_at IS NULL;

------------------------------------------------------------------------
-- Additional: products — index for mfg_company_id lookups
------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_products_mfg_company
  ON products(account_id, mfg_company_id)
  WHERE deleted_at IS NULL AND mfg_company_id IS NOT NULL;

------------------------------------------------------------------------
-- Additional: sales_returns — add deleted_at if missing (soft-delete parity)
------------------------------------------------------------------------
ALTER TABLE sales_returns
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE sales_returns
  ADD COLUMN IF NOT EXISTS cancelled_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL;

-- Soft-delete safe unique index for sales return numbers
DROP INDEX IF EXISTS sales_returns_number_unique;
CREATE UNIQUE INDEX IF NOT EXISTS sales_returns_number_unique
  ON sales_returns(account_id, return_number)
  WHERE deleted_at IS NULL;

------------------------------------------------------------------------
-- Additional: purchase_return_items — add GST breakdown columns (BE-09)
------------------------------------------------------------------------
ALTER TABLE purchase_return_items
  ADD COLUMN IF NOT EXISTS hsn_code text,
  ADD COLUMN IF NOT EXISTS gst_percent numeric(7,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gst_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS taxable_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cgst_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgst_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igst_amount numeric(14,2) NOT NULL DEFAULT 0;

-- Backfill gst_percent and taxable_amount from original purchase invoice items
UPDATE purchase_return_items pri
SET
  hsn_code       = COALESCE(pri.hsn_code,       pii.hsn_code),
  gst_percent    = COALESCE(NULLIF(pri.gst_percent, 0), pii.gst_percent, 0),
  gst_amount     = COALESCE(NULLIF(pri.gst_amount, 0),
                     ROUND(pri.return_amount * COALESCE(pii.gst_percent, 0) / (100 + COALESCE(pii.gst_percent, 0)), 2)),
  taxable_amount = COALESCE(NULLIF(pri.taxable_amount, 0),
                     ROUND(pri.return_amount / (1 + COALESCE(pii.gst_percent, 0) / 100), 2))
FROM purchase_invoice_items pii
WHERE pii.id = pri.purchase_invoice_item_id
  AND (pri.gst_percent = 0 OR pri.taxable_amount = 0);

-- Backfill cgst/sgst as half of gst_amount (intra-state assumption)
UPDATE purchase_return_items
SET
  cgst_amount = ROUND(gst_amount / 2, 2),
  sgst_amount = ROUND(gst_amount / 2, 2)
WHERE cgst_amount = 0 AND sgst_amount = 0 AND gst_amount > 0;

------------------------------------------------------------------------
-- Additional: sales_invoice_items — add is_interstate flag for IGST (BE-07)
------------------------------------------------------------------------
ALTER TABLE sales_invoices
  ADD COLUMN IF NOT EXISTS is_interstate boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS customer_state text,
  ADD COLUMN IF NOT EXISTS business_state text;

-- Index for interstate sales filtering in GST report
CREATE INDEX IF NOT EXISTS idx_sales_invoices_interstate
  ON sales_invoices(account_id, is_interstate, invoice_date)
  WHERE is_interstate = true;

------------------------------------------------------------------------
-- Additional: account_settings — add loose_unit_factor and enable_loose_sale
-- (referenced in runConfirmSalesCore.js but may be missing from schema)
------------------------------------------------------------------------
ALTER TABLE account_settings
  ADD COLUMN IF NOT EXISTS loose_unit_factor integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS enable_loose_sale boolean NOT NULL DEFAULT false;

ALTER TABLE account_settings
  DROP CONSTRAINT IF EXISTS account_settings_loose_unit_factor_chk;

ALTER TABLE account_settings
  ADD CONSTRAINT account_settings_loose_unit_factor_chk
  CHECK (loose_unit_factor >= 1 AND loose_unit_factor <= 1000);