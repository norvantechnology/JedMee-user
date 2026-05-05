-- 018_tenant_safe_fks_and_vendor_soft_delete.sql
-- Fix tenant-safety for cross-entity references and make vendor deletion consistent (soft delete).

-- 1) Vendors: add soft delete + make uniqueness soft-delete friendly
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

DROP INDEX IF EXISTS vendors_account_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS vendors_account_code_key
  ON vendors (account_id, lower(code))
  WHERE deleted_at IS NULL;

-- 2) Create tenant-safe unique keys for composite foreign keys
-- Vendors
CREATE UNIQUE INDEX IF NOT EXISTS vendors_account_id_id_key
  ON vendors (account_id, id);

-- Mfg companies
CREATE UNIQUE INDEX IF NOT EXISTS mfg_companies_account_id_id_key
  ON mfg_companies (account_id, id);

-- Products (for manufacturer links)
CREATE UNIQUE INDEX IF NOT EXISTS products_account_id_id_key
  ON products (account_id, id);

-- 3) Fix product_batches.vendor_id FK to be tenant-safe
ALTER TABLE product_batches
  DROP CONSTRAINT IF EXISTS product_batches_vendor_fk,
  ADD CONSTRAINT product_batches_vendor_fk
  FOREIGN KEY (account_id, vendor_id)
  REFERENCES vendors(account_id, id)
  ON DELETE SET NULL;

-- 4) Fix mfg_companies.main_company_id FK to be tenant-safe
ALTER TABLE mfg_companies
  DROP CONSTRAINT IF EXISTS mfg_companies_main_company_fk,
  ADD CONSTRAINT mfg_companies_main_company_fk
  FOREIGN KEY (account_id, main_company_id)
  REFERENCES mfg_companies(account_id, id)
  ON DELETE SET NULL;

-- 5) Link products -> mfg_companies (so mfg rules can be enforced)
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS mfg_company_id uuid;

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_mfg_company_fk,
  ADD CONSTRAINT products_mfg_company_fk
  FOREIGN KEY (account_id, mfg_company_id)
  REFERENCES mfg_companies(account_id, id)
  ON DELETE SET NULL;

