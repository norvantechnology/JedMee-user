-- 056_products_batch_missing_columns.sql
-- Add all columns referenced by current backend handlers that are missing from
-- the products and product_batches tables.
--
-- All statements use ADD COLUMN IF NOT EXISTS / DO blocks so this migration is
-- fully idempotent and safe to re-run.
--
-- Columns added:
--   products:
--     is_otc          boolean  - OTC flag (source-of-truth; snapshotted to batches)
--     rack_location   text     - shelf/rack label for physical location
--
--   product_batches:
--     is_otc          boolean  - snapshot of products.is_otc (SNAPSHOT_COLUMNS)
--     special_rate_1  numeric  - optional special pricing tier 1
--     special_rate_2  numeric  - optional special pricing tier 2
--     loose_stock     numeric  - loose/broken-pack stock quantity
--     loose_unit_name text     - unit name for loose stock (e.g. "tablet", "ml")
--     hold_reason     text     - reason text when is_hold = true

------------------------------------------------------------------------
-- 1. products - is_otc
------------------------------------------------------------------------
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS is_otc boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN products.is_otc IS
  'Over-the-counter flag. true = OTC (no prescription needed). Default true.';

------------------------------------------------------------------------
-- 2. products - rack_location
------------------------------------------------------------------------
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS rack_location text;

COMMENT ON COLUMN products.rack_location IS
  'Physical shelf / rack label (e.g. "A-3", "cold chain"). Optional.';

------------------------------------------------------------------------
-- 3. product_batches - is_otc  (snapshot of products.is_otc)
------------------------------------------------------------------------
ALTER TABLE product_batches
  ADD COLUMN IF NOT EXISTS is_otc boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN product_batches.is_otc IS
  'Snapshot of products.is_otc written at batch create/update time. '
  'Source-of-truth is products.is_otc; this copy exists for backward-compat '
  'with reports that join only product_batches.';

------------------------------------------------------------------------
-- 4. product_batches - special_rate_1 / special_rate_2
------------------------------------------------------------------------
ALTER TABLE product_batches
  ADD COLUMN IF NOT EXISTS special_rate_1 numeric(12,2),
  ADD COLUMN IF NOT EXISTS special_rate_2 numeric(12,2);

COMMENT ON COLUMN product_batches.special_rate_1 IS 'Optional special pricing tier 1 (e.g. hospital rate).';
COMMENT ON COLUMN product_batches.special_rate_2 IS 'Optional special pricing tier 2 (e.g. institution rate).';

------------------------------------------------------------------------
-- 5. product_batches - loose_stock / loose_unit_name
------------------------------------------------------------------------
ALTER TABLE product_batches
  ADD COLUMN IF NOT EXISTS loose_stock     numeric(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loose_unit_name text;

ALTER TABLE product_batches
  DROP CONSTRAINT IF EXISTS product_batches_loose_stock_non_negative;

ALTER TABLE product_batches
  ADD CONSTRAINT product_batches_loose_stock_non_negative
  CHECK (loose_stock >= 0);

COMMENT ON COLUMN product_batches.loose_stock IS
  'Broken-pack / loose unit stock quantity (e.g. individual tablets from an open strip).';
COMMENT ON COLUMN product_batches.loose_unit_name IS
  'Unit name for loose stock (e.g. "tablet", "capsule", "ml"). Stored in normalised lowercase.';

------------------------------------------------------------------------
-- 6. product_batches - hold_reason
------------------------------------------------------------------------
ALTER TABLE product_batches
  ADD COLUMN IF NOT EXISTS hold_reason text;

COMMENT ON COLUMN product_batches.hold_reason IS
  'Free-text reason recorded when is_hold = true (e.g. "quality check pending").';

------------------------------------------------------------------------
-- 7. Backfill is_otc on existing product_batches from products
--    (only rows where the batch is_otc still has the default value and
--     the parent product has is_otc explicitly set to false)
------------------------------------------------------------------------
UPDATE product_batches pb
SET    is_otc = p.is_otc
FROM   products p
WHERE  pb.product_id = p.id
  AND  pb.account_id = p.account_id
  AND  pb.is_otc IS DISTINCT FROM p.is_otc
  AND  pb.deleted_at IS NULL;

------------------------------------------------------------------------
-- 8. Indexes for new columns used in queries / filters
------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_products_is_otc
  ON products(account_id, is_otc)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_product_batches_is_otc
  ON product_batches(account_id, is_otc)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_product_batches_loose_stock
  ON product_batches(account_id)
  WHERE loose_stock > 0 AND deleted_at IS NULL;