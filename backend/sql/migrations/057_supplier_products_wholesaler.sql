-- 057_supplier_products_wholesaler.sql
-- Extend supplier_products for wholesaler context.
--
-- In a wholesaler setup the relationship is:
--   Manufacturer → Division (optional) → Product → Supplier (vendor)
--
-- The supplier_products table previously only linked vendor_id + product_id.
-- We now add division_id and mfg_company_id so that:
--   1. Supplier records can be filtered/grouped by division or manufacturer.
--   2. Reports can show "which vendor supplies products from which division/mfg".
--   3. The Quality Master page can display the preferred supplier per product.
--
-- All statements are idempotent (ADD COLUMN IF NOT EXISTS / DO blocks).

------------------------------------------------------------------------
-- 1) Add division_id and mfg_company_id columns
------------------------------------------------------------------------
ALTER TABLE supplier_products
  ADD COLUMN IF NOT EXISTS division_id    uuid,
  ADD COLUMN IF NOT EXISTS mfg_company_id uuid;

------------------------------------------------------------------------
-- 2) Foreign keys
------------------------------------------------------------------------
ALTER TABLE supplier_products
  DROP CONSTRAINT IF EXISTS supplier_products_division_fk;

ALTER TABLE supplier_products
  ADD CONSTRAINT supplier_products_division_fk
    FOREIGN KEY (account_id, division_id)
    REFERENCES divisions(account_id, id)
    ON DELETE SET NULL;

ALTER TABLE supplier_products
  DROP CONSTRAINT IF EXISTS supplier_products_mfg_fk;

ALTER TABLE supplier_products
  ADD CONSTRAINT supplier_products_mfg_fk
    FOREIGN KEY (account_id, mfg_company_id)
    REFERENCES mfg_companies(account_id, id)
    ON DELETE SET NULL;

------------------------------------------------------------------------
-- 3) Backfill division_id and mfg_company_id from the linked product
------------------------------------------------------------------------
UPDATE supplier_products sp
SET
  division_id    = COALESCE(sp.division_id,    p.division_id),
  mfg_company_id = COALESCE(sp.mfg_company_id, p.mfg_company_id)
FROM products p
WHERE sp.product_id  = p.id
  AND sp.account_id  = p.account_id
  AND (sp.division_id IS NULL OR sp.mfg_company_id IS NULL);

------------------------------------------------------------------------
-- 4) Indexes for the new columns
------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_supplier_products_division
  ON supplier_products(account_id, division_id)
  WHERE division_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_supplier_products_mfg
  ON supplier_products(account_id, mfg_company_id)
  WHERE mfg_company_id IS NOT NULL;