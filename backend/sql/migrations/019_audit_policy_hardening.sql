-- 019_audit_policy_hardening.sql
-- Strengthens data integrity, audit trail, and business rule enforcement.
-- Safe to run multiple times (idempotent where possible).

------------------------------------------------------------------------
-- 1. Partial unique indexes on soft-deletable master tables
------------------------------------------------------------------------
-- user_roles: make name unique-per-account soft-delete aware (add deleted_at
-- column first so the partial index is valid if future soft-deletes are added)
ALTER TABLE user_roles
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

DROP INDEX IF EXISTS user_roles_account_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS user_roles_account_name_key
  ON user_roles (account_id, lower(name))
  WHERE deleted_at IS NULL;

-- product_batches: older migration may have left hard unique indexes; re-ensure partials.
DROP INDEX IF EXISTS product_batches_account_product_code_key;
DROP INDEX IF EXISTS product_batches_account_product_batch_key;
DROP INDEX IF EXISTS product_batches_account_barcode_key;

CREATE UNIQUE INDEX IF NOT EXISTS product_batches_account_product_batch_key
  ON product_batches (account_id, product_id, lower(batch_no))
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS product_batches_account_barcode_key
  ON product_batches (account_id, lower(barcode))
  WHERE deleted_at IS NULL AND barcode IS NOT NULL AND barcode <> '';

------------------------------------------------------------------------
-- 2. mfg_companies: self-parent guard
------------------------------------------------------------------------
ALTER TABLE mfg_companies
  DROP CONSTRAINT IF EXISTS mfg_no_self_parent;
ALTER TABLE mfg_companies
  ADD CONSTRAINT mfg_no_self_parent
  CHECK (main_company_id IS NULL OR main_company_id <> id);

------------------------------------------------------------------------
-- 3. product_batches GST slab check
------------------------------------------------------------------------
ALTER TABLE product_batches
  DROP CONSTRAINT IF EXISTS valid_sales_gst,
  DROP CONSTRAINT IF EXISTS valid_purchase_gst;

ALTER TABLE product_batches
  ADD CONSTRAINT valid_sales_gst
  CHECK (sales_gst IS NULL OR sales_gst IN (0, 5, 12, 18, 28)),
  ADD CONSTRAINT valid_purchase_gst
  CHECK (purchase_gst IS NULL OR purchase_gst IN (0, 5, 12, 18, 28));

------------------------------------------------------------------------
-- 4. inventory_txns type enum + immutability trigger
------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inventory_txn_type') THEN
    CREATE TYPE inventory_txn_type AS ENUM (
      'OPENING',
      'OPENING_ADJUSTMENT',
      'PURCHASE',
      'PURCHASE_RETURN',
      'SALE',
      'SALE_RETURN',
      'EXPIRY_DAMAGE',
      'ADJUSTMENT'
    );
  END IF;
END$$;

-- Only alter column type if currently plain text.
DO $$
DECLARE
  data_t text;
BEGIN
  SELECT data_type INTO data_t
  FROM information_schema.columns
  WHERE table_name = 'inventory_txns' AND column_name = 'txn_type';

  IF data_t = 'text' THEN
    ALTER TABLE inventory_txns
      ALTER COLUMN txn_type TYPE inventory_txn_type
      USING txn_type::inventory_txn_type;
  END IF;
END$$;

-- Immutability: prevent UPDATE/DELETE on inventory_txns rows.
-- (The application uses a narrow DELETE exception when editing opening
-- stock before any other transactions exist; see note below.)
CREATE OR REPLACE FUNCTION prevent_txn_modification()
RETURNS trigger AS $$
BEGIN
  -- Allow deletes tagged with a session-local setting so the application
  -- can intentionally correct an OPENING row before any post-opening txn.
  IF TG_OP = 'DELETE' AND current_setting('medico.allow_txn_delete', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'inventory_txns rows are immutable. Use INSERT for corrections.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inventory_txns_immutable ON inventory_txns;
CREATE TRIGGER trg_inventory_txns_immutable
BEFORE UPDATE OR DELETE ON inventory_txns
FOR EACH ROW EXECUTE FUNCTION prevent_txn_modification();

------------------------------------------------------------------------
-- 5. Audit columns on master tables (created_by / updated_by / updated_at triggers)
------------------------------------------------------------------------
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL;

ALTER TABLE product_batches
  ADD COLUMN IF NOT EXISTS updated_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL;

ALTER TABLE mfg_companies
  ADD COLUMN IF NOT EXISTS updated_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL;

ALTER TABLE user_roles
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL;

-- Ensure set_updated_at trigger exists for every master table.
DROP TRIGGER IF EXISTS trg_products_updated_at ON products;
CREATE TRIGGER trg_products_updated_at
BEFORE UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_mfg_companies_updated_at ON mfg_companies;
CREATE TRIGGER trg_mfg_companies_updated_at
BEFORE UPDATE ON mfg_companies
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

------------------------------------------------------------------------
-- 6. Performance indexes
------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_vendors_account          ON vendors(account_id)            WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_products_account         ON products(account_id)           WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_batches_account          ON product_batches(account_id)    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_batches_product          ON product_batches(product_id)    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_batches_expiry           ON product_batches(expiry_date)   WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mfg_account              ON mfg_companies(account_id)      WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_batch          ON inventory_txns(batch_id);
CREATE INDEX IF NOT EXISTS idx_inventory_account_batch  ON inventory_txns(account_id, batch_id);
CREATE INDEX IF NOT EXISTS idx_users_account            ON app_users(account_id);
CREATE INDEX IF NOT EXISTS idx_role_members_user        ON user_role_members(user_id);
CREATE INDEX IF NOT EXISTS idx_role_perms_role          ON user_role_permissions(role_id);

------------------------------------------------------------------------
-- 7. current_stock cache + batch stock trigger (performance)
------------------------------------------------------------------------
ALTER TABLE product_batches
  ADD COLUMN IF NOT EXISTS current_stock numeric(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_free_stock numeric(12,3) NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION update_batch_stock_on_insert()
RETURNS trigger AS $$
BEGIN
  UPDATE product_batches
  SET current_stock      = COALESCE(current_stock, 0) + COALESCE(NEW.qty, 0),
      current_free_stock = COALESCE(current_free_stock, 0) + COALESCE(NEW.free_qty, 0),
      updated_at         = now()
  WHERE id = NEW.batch_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inventory_txns_update_stock ON inventory_txns;
CREATE TRIGGER trg_inventory_txns_update_stock
AFTER INSERT ON inventory_txns
FOR EACH ROW EXECUTE FUNCTION update_batch_stock_on_insert();

-- Backfill current_stock / current_free_stock from the ledger.
UPDATE product_batches pb
SET current_stock      = COALESCE((SELECT SUM(qty)      FROM inventory_txns WHERE batch_id = pb.id), 0),
    current_free_stock = COALESCE((SELECT SUM(free_qty) FROM inventory_txns WHERE batch_id = pb.id), 0);

------------------------------------------------------------------------
-- 8. vendor -> mfg_company link (optional, preferred over legacy text field)
------------------------------------------------------------------------
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS mfg_company_id uuid;

ALTER TABLE vendors
  DROP CONSTRAINT IF EXISTS vendors_mfg_company_fk,
  ADD CONSTRAINT vendors_mfg_company_fk
  FOREIGN KEY (account_id, mfg_company_id)
  REFERENCES mfg_companies(account_id, id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_vendors_mfg ON vendors(mfg_company_id) WHERE mfg_company_id IS NOT NULL;

------------------------------------------------------------------------
-- 9. product_batches extra columns for defined behaviors (is_hold etc.)
------------------------------------------------------------------------
ALTER TABLE product_batches
  ADD COLUMN IF NOT EXISTS hold_reason text;

------------------------------------------------------------------------
-- 10. permission_resources metadata + canonical seed
------------------------------------------------------------------------
ALTER TABLE permission_resources
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS sort_order int NOT NULL DEFAULT 100;

INSERT INTO permission_resources(resource, display_name, description, sort_order) VALUES
  ('USERS',           'Users',                    'Manage users and access control',            10),
  ('ROLES',           'Roles & Permissions',      'Define roles and assign permissions',        20),
  ('VENDORS',         'Vendors',                  'Manage supplier/vendor master',              30),
  ('MFG_COMPANIES',   'Manufacturing Companies',  'Manage manufacturer profiles and policies',  40),
  ('PRODUCT_BATCHES', 'Quality Master',           'Products and batch-level master records',    50)
ON CONFLICT (resource) DO UPDATE
SET display_name = EXCLUDED.display_name,
    description  = EXCLUDED.description,
    sort_order   = EXCLUDED.sort_order
WHERE permission_resources.display_name IS DISTINCT FROM EXCLUDED.display_name
   OR permission_resources.description  IS DISTINCT FROM EXCLUDED.description
   OR permission_resources.sort_order   IS DISTINCT FROM EXCLUDED.sort_order;
