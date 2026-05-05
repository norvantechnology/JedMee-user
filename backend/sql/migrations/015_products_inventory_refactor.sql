-- 015_products_inventory_refactor.sql
-- Fix Quality Master modeling:
-- - Separate products from batches (many batches per product)
-- - Add inventory ledger (inventory_txns) for correct stock tracking
-- - Make uniqueness constraints soft-delete friendly (partial indexes)

-- Products (account scoped)
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  drug_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- Soft-delete friendly product code uniqueness
DROP INDEX IF EXISTS products_account_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS products_account_code_key
  ON products (account_id, lower(code))
  WHERE deleted_at IS NULL;

-- Add links to product_batches
ALTER TABLE product_batches
  ADD COLUMN IF NOT EXISTS product_id uuid,
  ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL;

-- Backfill products from existing batches (include deleted rows too to preserve references)
INSERT INTO products (account_id, code, name, drug_name)
SELECT
  pb.account_id,
  pb.product_code,
  pb.product_name,
  pb.drug_name
FROM product_batches pb
WHERE pb.product_code IS NOT NULL AND pb.product_code <> ''
ON CONFLICT DO NOTHING;

-- Link product_batches -> products
UPDATE product_batches pb
SET product_id = p.id
FROM products p
WHERE p.account_id = pb.account_id
  AND lower(p.code) = lower(pb.product_code)
  AND pb.product_id IS NULL;

-- Enforce product_id (only if data is consistent)
ALTER TABLE product_batches
  ALTER COLUMN product_id SET NOT NULL;

ALTER TABLE product_batches
  ADD CONSTRAINT product_batches_product_fk
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;

-- Inventory ledger for correct stock tracking (opening stock becomes an OPENING txn)
CREATE TABLE IF NOT EXISTS inventory_txns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES product_batches(id) ON DELETE CASCADE,
  txn_type text NOT NULL, -- OPENING / ADJUSTMENT / PURCHASE / SALE (future)
  qty numeric(12,3) NOT NULL DEFAULT 0, -- paid qty
  free_qty numeric(12,3) NOT NULL DEFAULT 0,
  note text,
  created_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inventory_txns_account_batch_idx ON inventory_txns (account_id, batch_id);
CREATE INDEX IF NOT EXISTS inventory_txns_account_created_idx ON inventory_txns (account_id, created_at desc);

-- Backfill opening stock into ledger (only once)
INSERT INTO inventory_txns (account_id, batch_id, txn_type, qty, free_qty, note, created_by_user_id)
SELECT
  pb.account_id,
  pb.id,
  'OPENING',
  COALESCE(pb.opening_stock, 0),
  COALESCE(pb.open_stock_free_qty, 0),
  'Backfilled opening stock',
  pb.created_by_user_id
FROM product_batches pb
WHERE (COALESCE(pb.opening_stock, 0) <> 0 OR COALESCE(pb.open_stock_free_qty, 0) <> 0)
  AND NOT EXISTS (
    SELECT 1 FROM inventory_txns it
    WHERE it.batch_id = pb.id AND it.account_id = pb.account_id AND it.txn_type = 'OPENING'
  );

-- Drop old non-soft-delete uniqueness and recreate as partial indexes
DROP INDEX IF EXISTS product_batches_account_product_code_key;
DROP INDEX IF EXISTS product_batches_account_product_batch_key;
DROP INDEX IF EXISTS product_batches_account_barcode_key;

-- Multiple batches per product: uniqueness is per product_id + batch_no
CREATE UNIQUE INDEX IF NOT EXISTS product_batches_account_product_batch_key
  ON product_batches (account_id, product_id, lower(batch_no))
  WHERE deleted_at IS NULL;

-- Barcode unique among active rows only
CREATE UNIQUE INDEX IF NOT EXISTS product_batches_account_barcode_key
  ON product_batches (account_id, barcode)
  WHERE deleted_at IS NULL AND barcode IS NOT NULL AND barcode <> '';

-- Keep lookup index for product_code text (not unique anymore)
CREATE INDEX IF NOT EXISTS product_batches_account_product_code_idx
  ON product_batches (account_id, lower(product_code))
  WHERE deleted_at IS NULL;

