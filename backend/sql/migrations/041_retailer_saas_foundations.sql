-- Retailer SaaS/accounting foundations:
-- - GST split columns for tax invoice lines
-- - packing units for loose sale pricing
-- - day-book opening cash and FY fields
-- - invoice-level payment mode
-- - invoice counters for atomic numbering
-- - common balance and ledger views

ALTER TABLE sales_invoice_items
  ADD COLUMN IF NOT EXISTS cgst_amount NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgst_amount NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igst_amount NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE product_batches
  ADD COLUMN IF NOT EXISTS packing_units INTEGER NOT NULL DEFAULT 10;

ALTER TABLE account_settings
  ADD COLUMN IF NOT EXISTS daily_opening_cash NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS financial_year_start DATE DEFAULT '2025-04-01',
  ADD COLUMN IF NOT EXISTS financial_year_end DATE DEFAULT '2026-03-31';

ALTER TABLE sales_invoices
  ADD COLUMN IF NOT EXISTS payment_mode TEXT DEFAULT 'CASH'
    CHECK (payment_mode IN ('CASH', 'UPI', 'CARD', 'CHEQUE', 'NEFT', 'CREDIT', 'ADVANCE'));

CREATE TABLE IF NOT EXISTS invoice_counters (
  account_id UUID PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  financial_year TEXT NOT NULL DEFAULT '2025-26',
  sales_counter INTEGER NOT NULL DEFAULT 0,
  purchase_counter INTEGER NOT NULL DEFAULT 0,
  sales_return_counter INTEGER NOT NULL DEFAULT 0,
  purchase_return_counter INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE VIEW customer_balances AS
SELECT
  c.account_id,
  c.id AS customer_id,
  COALESCE((
    SELECT SUM(cp.amount)::numeric(14,2)
    FROM customer_payments cp
    WHERE cp.account_id = c.account_id
      AND cp.customer_id = c.id
      AND COALESCE(cp.allocation_type, 'ON_ACCOUNT') = 'ON_ACCOUNT'
  ), 0)::numeric(14,2) AS advance_balance,
  COALESCE((
    SELECT SUM(si.balance_due)::numeric(14,2)
    FROM sales_invoices si
    WHERE si.account_id = c.account_id
      AND si.customer_id = c.id
      AND si.deleted_at IS NULL
      AND si.status = 'CONFIRMED'
      AND si.payment_status IN ('UNPAID', 'PARTIAL')
  ), 0)::numeric(14,2) AS outstanding_amount,
  COALESCE((
    SELECT COUNT(*)::int
    FROM sales_invoices si
    WHERE si.account_id = c.account_id
      AND si.customer_id = c.id
      AND si.deleted_at IS NULL
      AND si.status = 'CONFIRMED'
      AND si.payment_status = 'UNPAID'
  ), 0)::int AS unpaid_invoice_count
FROM customers c
WHERE c.deleted_at IS NULL;
