-- 060_sales_invoice_items_qty_allow_zero.sql
-- Allow qty=0 on sales_invoice_items when loose_qty > 0.
--
-- Previously qty had CHECK (qty > 0) which blocked selling individual units
-- without a full strip (qty=0, loose_qty=N - the "unit mode" / loose-only sale).
--
-- New rules:
--   qty >= 0                          (non-negative)
--   qty > 0 OR loose_qty > 0         (at least one quantity must be positive)
--
-- Idempotent: uses DROP CONSTRAINT IF EXISTS before each ADD.

------------------------------------------------------------------------
-- 1. Drop the old strict CHECK (qty > 0)
------------------------------------------------------------------------
ALTER TABLE sales_invoice_items
  DROP CONSTRAINT IF EXISTS sales_invoice_items_qty_check;

------------------------------------------------------------------------
-- 2. Add relaxed non-negative check for qty
------------------------------------------------------------------------
ALTER TABLE sales_invoice_items
  DROP CONSTRAINT IF EXISTS sales_invoice_items_qty_nonneg;

ALTER TABLE sales_invoice_items
  ADD CONSTRAINT sales_invoice_items_qty_nonneg
    CHECK (qty >= 0);

------------------------------------------------------------------------
-- 3. Ensure at least one of qty or loose_qty is positive per line
--    (prevents fully-zero lines from being inserted)
------------------------------------------------------------------------
ALTER TABLE sales_invoice_items
  DROP CONSTRAINT IF EXISTS sales_invoice_items_qty_or_loose_positive;

ALTER TABLE sales_invoice_items
  ADD CONSTRAINT sales_invoice_items_qty_or_loose_positive
    CHECK (qty > 0 OR loose_qty > 0);