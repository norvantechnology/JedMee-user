-- Migration 050: Missing compound indexes for high-traffic query paths
--
-- Covers gaps identified in the backend audit (Phase 14):
--   • purchase_returns  — list/filter/invoice-lookup paths
--   • purchase_return_items — tenant isolation + join path
--   • sales_invoice_items  — GSTR-1 HSN grouping + invoice join
--   • vendors              — soft-delete list path
--   • purchase_invoices    — vendor-filtered list path
--
-- All statements use IF NOT EXISTS so the migration is safe to re-run.

------------------------------------------------------------------------
-- purchase_returns
------------------------------------------------------------------------

-- Primary list query: account + date range, soft-delete filtered
CREATE INDEX IF NOT EXISTS idx_purchase_returns_account_date
  ON purchase_returns(account_id, return_date DESC)
  WHERE deleted_at IS NULL;

-- Filtered list: account + status + date (status filter is common in UI)
CREATE INDEX IF NOT EXISTS idx_purchase_returns_account_status_date
  ON purchase_returns(account_id, status, return_date DESC)
  WHERE deleted_at IS NULL;

-- Lookup returns for a specific purchase invoice (used in invoice detail view)
CREATE INDEX IF NOT EXISTS idx_purchase_returns_account_invoice
  ON purchase_returns(account_id, purchase_invoice_id)
  WHERE deleted_at IS NULL;

-- Division-filtered list (wholesaler accounts filter by division)
CREATE INDEX IF NOT EXISTS idx_purchase_returns_account_division_date
  ON purchase_returns(account_id, division_id, return_date DESC)
  WHERE deleted_at IS NULL;

------------------------------------------------------------------------
-- purchase_return_items
------------------------------------------------------------------------

-- Tenant isolation for direct item queries
CREATE INDEX IF NOT EXISTS idx_purchase_return_items_account_id
  ON purchase_return_items(account_id);

-- Batch-level lookup (used when reversing inventory for a batch)
CREATE INDEX IF NOT EXISTS idx_purchase_return_items_batch_id
  ON purchase_return_items(batch_id)
  WHERE batch_id IS NOT NULL;

------------------------------------------------------------------------
-- sales_invoice_items
------------------------------------------------------------------------

-- GSTR-1 report: groups by account + HSN code across a date range.
-- The report joins sales_invoices → sales_invoice_items, so the
-- covering index on the items side must include account_id + hsn_code.
CREATE INDEX IF NOT EXISTS idx_sales_invoice_items_account_hsn
  ON sales_invoice_items(account_id, hsn_code)
  WHERE hsn_code IS NOT NULL;

-- Invoice join path (sales_invoices.id → sales_invoice_items.sales_invoice_id)
CREATE INDEX IF NOT EXISTS idx_sales_invoice_items_invoice_id
  ON sales_invoice_items(sales_invoice_id);

------------------------------------------------------------------------
-- vendors
------------------------------------------------------------------------

-- Soft-delete list path: account + deleted_at filter
CREATE INDEX IF NOT EXISTS idx_vendors_account_deleted_at
  ON vendors(account_id, deleted_at);

-- Vendor list ordered by name (default sort in list API)
CREATE INDEX IF NOT EXISTS idx_vendors_account_name
  ON vendors(account_id, name)
  WHERE deleted_at IS NULL;

------------------------------------------------------------------------
-- purchase_invoices
------------------------------------------------------------------------

-- Vendor-filtered list (common filter in purchase invoice list UI)
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_account_vendor_date
  ON purchase_invoices(account_id, vendor_id, invoice_date DESC)
  WHERE deleted_at IS NULL;

------------------------------------------------------------------------
-- purchase_returns — trigram search
-- list.js searches: return_number ILIKE '%q%' OR credit_note_number ILIKE '%q%'
------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_purchase_returns_return_number_trgm
  ON purchase_returns USING gin (return_number gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_returns_credit_note_trgm
  ON purchase_returns USING gin (credit_note_number gin_trgm_ops)
  WHERE deleted_at IS NULL AND credit_note_number IS NOT NULL;