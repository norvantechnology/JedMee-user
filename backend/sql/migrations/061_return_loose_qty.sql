-- 061_return_loose_qty.sql
-- Add return_loose_qty to sales_return_items and purchase_return_items
-- to support returning loose / broken-pack individual units (tablets, capsules, ml).
--
-- Loose qty is the number of individual units (not full strips/packs) being returned.
-- The loose amount is calculated as: return_loose_qty × (net_rate / packing_units).
-- On confirm, loose_stock on the batch is incremented by return_loose_qty.

------------------------------------------------------------------------
-- 1. sales_return_items — return_loose_qty
------------------------------------------------------------------------
ALTER TABLE sales_return_items
  ADD COLUMN IF NOT EXISTS return_loose_qty numeric(12,3) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_return_items_loose_qty_nonneg'
  ) THEN
    ALTER TABLE sales_return_items
      ADD CONSTRAINT sales_return_items_loose_qty_nonneg CHECK (return_loose_qty >= 0);
  END IF;
END$$;

COMMENT ON COLUMN sales_return_items.return_loose_qty IS
  'Number of individual loose units (tablets, capsules, ml) being returned. '
  'Separate from return_qty (full strips/packs). '
  'On confirm, this quantity is added back to product_batches.loose_stock.';

------------------------------------------------------------------------
-- 2. purchase_return_items — return_loose_qty
------------------------------------------------------------------------
ALTER TABLE purchase_return_items
  ADD COLUMN IF NOT EXISTS return_loose_qty numeric(12,3) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'purchase_return_items_loose_qty_nonneg'
  ) THEN
    ALTER TABLE purchase_return_items
      ADD CONSTRAINT purchase_return_items_loose_qty_nonneg CHECK (return_loose_qty >= 0);
  END IF;
END$$;

COMMENT ON COLUMN purchase_return_items.return_loose_qty IS
  'Number of individual loose units being returned to the vendor. '
  'On confirm, this quantity is added back to product_batches.loose_stock.';