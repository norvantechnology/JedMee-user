-- 025_customer_advance_allocation_indexes.sql
-- Purpose:
-- Speed up "apply advance to invoice" flow and invoice payment rollups.

-- Fast lookup of unallocated customer advances in FIFO order.
CREATE INDEX IF NOT EXISTS idx_customer_payments_unallocated_fifo
  ON customer_payments(account_id, customer_id, payment_date, created_at, id)
  WHERE sales_invoice_id IS NULL;

-- Fast sum of allocated payments per sales invoice.
CREATE INDEX IF NOT EXISTS idx_customer_payments_invoice_sum
  ON customer_payments(account_id, sales_invoice_id, created_at)
  WHERE sales_invoice_id IS NOT NULL;
