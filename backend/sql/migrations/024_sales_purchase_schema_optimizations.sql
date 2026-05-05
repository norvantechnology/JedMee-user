-- 024_sales_purchase_schema_optimizations.sql
-- Purpose:
-- 1) Fill missing vendor credit term column used by purchase due-date logic.
-- 2) Harden customer payment allocation consistency.
-- 3) Add practical indexes for heavy purchase/sales list filtering.

------------------------------------------------------------------------
-- 1) Vendors: credit term support for purchase due-date auto-calc
------------------------------------------------------------------------
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS credit_days integer NOT NULL DEFAULT 0;

ALTER TABLE vendors
  DROP CONSTRAINT IF EXISTS vendors_credit_days_non_negative;

ALTER TABLE vendors
  ADD CONSTRAINT vendors_credit_days_non_negative CHECK (credit_days >= 0);

------------------------------------------------------------------------
-- 2) Customer payments: enforce allocation_type consistency
------------------------------------------------------------------------
ALTER TABLE customer_payments
  ADD COLUMN IF NOT EXISTS allocation_type text NOT NULL DEFAULT 'INVOICE';

UPDATE customer_payments
SET allocation_type = CASE WHEN sales_invoice_id IS NULL THEN 'ON_ACCOUNT' ELSE 'INVOICE' END
WHERE allocation_type IS NULL
   OR allocation_type NOT IN ('INVOICE', 'ON_ACCOUNT');

ALTER TABLE customer_payments
  DROP CONSTRAINT IF EXISTS customer_payments_allocation_type_chk;

ALTER TABLE customer_payments
  ADD CONSTRAINT customer_payments_allocation_type_chk
  CHECK (allocation_type IN ('INVOICE', 'ON_ACCOUNT'));

ALTER TABLE customer_payments
  DROP CONSTRAINT IF EXISTS customer_payments_allocation_invoice_link_chk;

ALTER TABLE customer_payments
  ADD CONSTRAINT customer_payments_allocation_invoice_link_chk
  CHECK (
    (allocation_type = 'INVOICE' AND sales_invoice_id IS NOT NULL)
    OR
    (allocation_type = 'ON_ACCOUNT' AND sales_invoice_id IS NULL)
  );

------------------------------------------------------------------------
-- 3) Indexes for common filter/sort paths
------------------------------------------------------------------------
-- Purchase list: account + date/status/payment + soft-delete predicate.
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_account_date_status_payment
  ON purchase_invoices(account_id, invoice_date DESC, status, payment_status)
  WHERE deleted_at IS NULL;

-- Purchase list: vendor + date (vendor-specific history screens).
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_account_vendor_date
  ON purchase_invoices(account_id, vendor_id, invoice_date DESC)
  WHERE deleted_at IS NULL;

-- Customer payments list: account + date sort path.
CREATE INDEX IF NOT EXISTS idx_customer_payments_account_date_created
  ON customer_payments(account_id, payment_date DESC, created_at DESC);

-- Customer payments filters: account + allocation.
CREATE INDEX IF NOT EXISTS idx_customer_payments_account_allocation
  ON customer_payments(account_id, allocation_type);

-- Sales list: account + date/status/payment for table filters.
CREATE INDEX IF NOT EXISTS idx_sales_invoices_account_date_status_payment
  ON sales_invoices(account_id, invoice_date DESC, status, payment_status);
