-- 034_api_performance_indexes.sql
-- Purpose:
-- Add high-impact indexes for hot list/search API paths (products, batches,
-- purchase invoices, sales invoices) while keeping behavior unchanged.

------------------------------------------------------------------------
-- Products list/search/filter
------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_products_account_division_name
  ON products(account_id, division_id, name)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_account_mfg_name
  ON products(account_id, mfg_company_id, name)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_account_updated_at
  ON products(account_id, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_name_trgm
  ON products USING gin (name gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_code_trgm
  ON products USING gin (code gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_drug_name_trgm
  ON products USING gin (drug_name gin_trgm_ops)
  WHERE deleted_at IS NULL;

------------------------------------------------------------------------
-- Product batches list/search/filter
------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_product_batches_account_product_created
  ON product_batches(account_id, product_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_product_batches_account_batch_no
  ON product_batches(account_id, batch_no)
  WHERE deleted_at IS NULL;

-- Fast check for "opening stock locked" existence path.
CREATE INDEX IF NOT EXISTS idx_inventory_txns_account_batch_non_opening
  ON inventory_txns(account_id, batch_id)
  WHERE txn_type <> 'OPENING'::inventory_txn_type;

------------------------------------------------------------------------
-- Purchase invoices list/search/filter
------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_account_division_date
  ON purchase_invoices(account_id, division_id, invoice_date DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_invoices_account_status_date
  ON purchase_invoices(account_id, status, payment_status, invoice_date DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_invoices_invoice_number_trgm
  ON purchase_invoices USING gin (invoice_number gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_invoices_vendor_invoice_number_trgm
  ON purchase_invoices USING gin (vendor_invoice_number gin_trgm_ops)
  WHERE deleted_at IS NULL;

------------------------------------------------------------------------
-- Sales invoices list/search/filter
------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_sales_invoices_account_customer_date
  ON sales_invoices(account_id, customer_id, invoice_date DESC);

CREATE INDEX IF NOT EXISTS idx_sales_invoices_account_status_date
  ON sales_invoices(account_id, status, payment_status, invoice_date DESC);

CREATE INDEX IF NOT EXISTS idx_sales_invoices_invoice_number_trgm
  ON sales_invoices USING gin (invoice_number gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_sales_invoices_customer_name_trgm
  ON sales_invoices USING gin (customer_name gin_trgm_ops);

