-- 026_sales_invoices_soft_delete_compat.sql
-- Purpose:
-- Ensure sales_invoices has soft-delete compatibility fields/indexes expected by API handlers.

ALTER TABLE sales_invoices
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Optional but recommended for common active-invoice filters.
CREATE INDEX IF NOT EXISTS idx_sales_invoices_account_active
  ON sales_invoices(account_id, created_at DESC)
  WHERE deleted_at IS NULL;
