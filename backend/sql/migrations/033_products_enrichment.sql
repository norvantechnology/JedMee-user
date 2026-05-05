-- 033_products_enrichment.sql
-- Move product-level fields (that are same across all batches) from product_batches
-- onto products; link products to divisions (source-of-truth for manufacturer).
--
-- Strategy: batches keep the old columns (read-through at query time; no writes
-- from new code). Strict NOT NULL for products.division_id is applied only when
-- the account has divisions and every product has been backfilled; otherwise
-- the column stays nullable so legacy data remains valid.

------------------------------------------------------------------------
-- 1) Unique (account_id, id) keys needed for composite FKs
------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS products_account_id_unique
  ON products(account_id, id);

------------------------------------------------------------------------
-- 2) Add product-level columns
------------------------------------------------------------------------
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS division_id uuid,
  ADD COLUMN IF NOT EXISTS packing text,
  ADD COLUMN IF NOT EXISTS bulk_pack text,
  ADD COLUMN IF NOT EXISTS case_pack text,
  ADD COLUMN IF NOT EXISTS conversion_unit text,
  ADD COLUMN IF NOT EXISTS stockable boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_discount_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_control boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sales_gst numeric,
  ADD COLUMN IF NOT EXISTS purchase_gst numeric,
  ADD COLUMN IF NOT EXISTS sales_scheme text,
  ADD COLUMN IF NOT EXISTS scheme_qty_paid numeric,
  ADD COLUMN IF NOT EXISTS scheme_qty_free numeric,
  ADD COLUMN IF NOT EXISTS is_half_scheme boolean NOT NULL DEFAULT false;

-- GST slab guard (idempotent)
ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_sales_gst_chk,
  DROP CONSTRAINT IF EXISTS products_purchase_gst_chk;

ALTER TABLE products
  ADD CONSTRAINT products_sales_gst_chk
    CHECK (sales_gst IS NULL OR sales_gst = ANY(ARRAY[0,5,12,18,28])),
  ADD CONSTRAINT products_purchase_gst_chk
    CHECK (purchase_gst IS NULL OR purchase_gst = ANY(ARRAY[0,5,12,18,28]));

-- Division FK (tenant-safe: account + id)
ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_division_fk;

ALTER TABLE products
  ADD CONSTRAINT products_division_fk
  FOREIGN KEY (account_id, division_id)
  REFERENCES divisions(account_id, id)
  ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_products_division
  ON products(division_id)
  WHERE division_id IS NOT NULL AND deleted_at IS NULL;

------------------------------------------------------------------------
-- 3) Backfill product-level fields from most recent active batch
------------------------------------------------------------------------
WITH latest AS (
  SELECT DISTINCT ON (pb.account_id, pb.product_id)
    pb.account_id,
    pb.product_id,
    pb.division_id,
    pb.packing,
    pb.bulk_pack,
    pb.case_pack,
    CASE
      WHEN pb.conversion_unit IS NULL THEN NULL
      ELSE pb.conversion_unit::text
    END AS conversion_unit,
    pb.stockable,
    pb.is_discount_enabled,
    pb.is_control,
    pb.sales_gst,
    pb.purchase_gst,
    pb.sales_scheme,
    pb.scheme_qty_paid,
    pb.scheme_qty_free,
    pb.is_half_scheme
  FROM product_batches pb
  WHERE pb.deleted_at IS NULL
  ORDER BY pb.account_id, pb.product_id, pb.created_at DESC
)
UPDATE products p
SET
  packing = COALESCE(p.packing, l.packing),
  bulk_pack = COALESCE(p.bulk_pack, l.bulk_pack),
  case_pack = COALESCE(p.case_pack, l.case_pack),
  conversion_unit = COALESCE(p.conversion_unit, l.conversion_unit),
  stockable = CASE WHEN p.stockable IS DISTINCT FROM true THEN p.stockable ELSE COALESCE(l.stockable, true) END,
  is_discount_enabled = CASE WHEN p.is_discount_enabled IS DISTINCT FROM true THEN p.is_discount_enabled ELSE COALESCE(l.is_discount_enabled, true) END,
  is_control = CASE WHEN p.is_control IS DISTINCT FROM false THEN p.is_control ELSE COALESCE(l.is_control, false) END,
  sales_gst = COALESCE(p.sales_gst, l.sales_gst),
  purchase_gst = COALESCE(p.purchase_gst, l.purchase_gst),
  sales_scheme = COALESCE(p.sales_scheme, l.sales_scheme),
  scheme_qty_paid = COALESCE(p.scheme_qty_paid, l.scheme_qty_paid),
  scheme_qty_free = COALESCE(p.scheme_qty_free, l.scheme_qty_free),
  is_half_scheme = CASE WHEN p.is_half_scheme IS DISTINCT FROM false THEN p.is_half_scheme ELSE COALESCE(l.is_half_scheme, false) END,
  division_id = COALESCE(p.division_id, l.division_id)
FROM latest l
WHERE p.id = l.product_id
  AND p.account_id = l.account_id;

-- Back-fill mfg_company_id from division where product has no mfg set
UPDATE products p
SET mfg_company_id = d.mfg_company_id
FROM divisions d
WHERE p.division_id = d.id
  AND p.account_id = d.account_id
  AND p.mfg_company_id IS NULL
  AND p.deleted_at IS NULL;

------------------------------------------------------------------------
-- 4) Try to enforce NOT NULL for division_id (only if data is clean)
--    Leaves the column nullable if there are legacy products without a division.
------------------------------------------------------------------------
DO $$
DECLARE
  unresolved int;
BEGIN
  SELECT COUNT(*) INTO unresolved
  FROM products
  WHERE deleted_at IS NULL AND division_id IS NULL;

  IF unresolved = 0 THEN
    BEGIN
      ALTER TABLE products ALTER COLUMN division_id SET NOT NULL;
      RAISE NOTICE 'products.division_id is now NOT NULL.';
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Could not set products.division_id NOT NULL: %', SQLERRM;
    END;
  ELSE
    RAISE NOTICE
      'Leaving products.division_id nullable: % active product(s) have no division. Fix manually, then run: ALTER TABLE products ALTER COLUMN division_id SET NOT NULL;',
      unresolved;
  END IF;
END $$;

------------------------------------------------------------------------
-- 5) Deprecation comments on the old batch columns
--    (Backend reads product-level values now; batches may still have stale
--     copies  they are ignored going forward.)
------------------------------------------------------------------------
COMMENT ON COLUMN product_batches.packing             IS 'DEPRECATED 033: moved to products.packing (read from product).';
COMMENT ON COLUMN product_batches.bulk_pack           IS 'DEPRECATED 033: moved to products.bulk_pack.';
COMMENT ON COLUMN product_batches.case_pack           IS 'DEPRECATED 033: moved to products.case_pack.';
COMMENT ON COLUMN product_batches.conversion_unit     IS 'DEPRECATED 033: moved to products.conversion_unit.';
COMMENT ON COLUMN product_batches.stockable           IS 'DEPRECATED 033: moved to products.stockable.';
COMMENT ON COLUMN product_batches.is_discount_enabled IS 'DEPRECATED 033: moved to products.is_discount_enabled.';
COMMENT ON COLUMN product_batches.is_control          IS 'DEPRECATED 033: moved to products.is_control.';
COMMENT ON COLUMN product_batches.sales_gst           IS 'DEPRECATED 033: moved to products.sales_gst.';
COMMENT ON COLUMN product_batches.purchase_gst        IS 'DEPRECATED 033: moved to products.purchase_gst.';
COMMENT ON COLUMN product_batches.sales_scheme        IS 'DEPRECATED 033: moved to products.sales_scheme.';
COMMENT ON COLUMN product_batches.scheme_qty_paid     IS 'DEPRECATED 033: moved to products.scheme_qty_paid.';
COMMENT ON COLUMN product_batches.scheme_qty_free     IS 'DEPRECATED 033: moved to products.scheme_qty_free.';
COMMENT ON COLUMN product_batches.is_half_scheme      IS 'DEPRECATED 033: moved to products.is_half_scheme.';

------------------------------------------------------------------------
-- 6) Re-assert product name uniqueness per manufacturer (idempotent)
------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS products_name_per_mfg_unique
  ON products(account_id, mfg_company_id, lower(name))
  WHERE deleted_at IS NULL AND mfg_company_id IS NOT NULL;
