-- 059_products_units_per_strip.sql
-- Add units_per_strip to products: how many individual units (tablets/capsules/ml)
-- are in one strip/blister/vial — the base inventory unit.
--
-- This enables correct price and quantity conversion when purchasing or selling
-- by Case / Box / Strip / Unit (individual tablet/capsule).
--
-- Relationship:
--   packing       = strips per box   (e.g. 10)
--   bulk_pack     = boxes per case   (e.g. 12)
--   case_pack     = strips per case  (auto = packing × bulk_pack = 120)
--   units_per_strip = tablets per strip (e.g. 10)
--
-- So 1 case = 120 strips = 1200 tablets.
--
-- Also adds packing_units to product_batches as a snapshot of products.units_per_strip
-- so batch-level queries (sales billing, inventory) can read it without a join.
--
-- Idempotent: all statements use IF NOT EXISTS / DO blocks.

------------------------------------------------------------------------
-- 1. products — units_per_strip
------------------------------------------------------------------------
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS units_per_strip integer NOT NULL DEFAULT 1;

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_units_per_strip_positive;

ALTER TABLE products
  ADD CONSTRAINT products_units_per_strip_positive
    CHECK (units_per_strip >= 1);

COMMENT ON COLUMN products.units_per_strip IS
  'Number of individual sellable units (tablets, capsules, ml) per strip/blister/vial. '
  'Used for loose-unit price and quantity conversion. Default 1 (no sub-unit splitting).';

------------------------------------------------------------------------
-- 2. product_batches — packing_units (snapshot of products.units_per_strip)
------------------------------------------------------------------------
ALTER TABLE product_batches
  ADD COLUMN IF NOT EXISTS packing_units integer NOT NULL DEFAULT 1;

ALTER TABLE product_batches
  DROP CONSTRAINT IF EXISTS product_batches_packing_units_positive;

ALTER TABLE product_batches
  ADD CONSTRAINT product_batches_packing_units_positive
    CHECK (packing_units >= 1);

COMMENT ON COLUMN product_batches.packing_units IS
  'Snapshot of products.units_per_strip written at batch create/update time. '
  'Source-of-truth is products.units_per_strip. '
  'Used by sales billing loose-qty calculations without a product join.';

------------------------------------------------------------------------
-- 3. Backfill packing_units on existing batches from products
------------------------------------------------------------------------
UPDATE product_batches pb
SET    packing_units = GREATEST(1, COALESCE(p.units_per_strip, 1))
FROM   products p
WHERE  pb.product_id = p.id
  AND  pb.account_id = p.account_id
  AND  pb.deleted_at IS NULL
  AND  pb.packing_units = 1
  AND  COALESCE(p.units_per_strip, 1) > 1;

------------------------------------------------------------------------
-- 4. Index for batch lookups that filter on packing_units
------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_product_batches_packing_units
  ON product_batches(account_id, packing_units)
  WHERE deleted_at IS NULL AND packing_units > 1;