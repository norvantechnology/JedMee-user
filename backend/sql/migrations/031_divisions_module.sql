-- 031_divisions_module.sql
-- Divisions (supplier divisions under manufacturers), division_id on purchase/batches,
-- division_payments, product name uniqueness per manufacturer.

------------------------------------------------------------------------
-- 1) divisions
------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS divisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  short_name text,
  mfg_company_id uuid NOT NULL,
  phone_country_code text DEFAULT '+91',
  phone_number text,
  email text,
  address text,
  notes text,
  credit_days integer NOT NULL DEFAULT 0 CHECK (credit_days >= 0),
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  CONSTRAINT divisions_account_mfg_fk
    FOREIGN KEY (account_id, mfg_company_id)
    REFERENCES mfg_companies(account_id, id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS divisions_code_unique
  ON divisions(account_id, lower(code))
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS divisions_name_per_mfg_unique
  ON divisions(account_id, mfg_company_id, lower(name))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_divisions_account ON divisions(account_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_divisions_mfg ON divisions(mfg_company_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_divisions_account_active ON divisions(account_id, is_active) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS divisions_account_id_unique
  ON divisions(account_id, id);

DROP TRIGGER IF EXISTS trg_divisions_updated_at ON divisions;
CREATE TRIGGER trg_divisions_updated_at
BEFORE UPDATE ON divisions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

------------------------------------------------------------------------
-- 2) product_batches.division_id
------------------------------------------------------------------------
ALTER TABLE product_batches
  ADD COLUMN IF NOT EXISTS division_id uuid;

ALTER TABLE product_batches
  DROP CONSTRAINT IF EXISTS product_batches_division_fk;

ALTER TABLE product_batches
  ADD CONSTRAINT product_batches_division_fk
  FOREIGN KEY (account_id, division_id)
  REFERENCES divisions(account_id, id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_batches_division
  ON product_batches(division_id)
  WHERE division_id IS NOT NULL AND deleted_at IS NULL;

------------------------------------------------------------------------
-- 3) purchase_invoices: division + nullable vendor (legacy)
------------------------------------------------------------------------
ALTER TABLE purchase_invoices
  ADD COLUMN IF NOT EXISTS division_id uuid,
  ADD COLUMN IF NOT EXISTS division_name text;

ALTER TABLE purchase_invoices
  ALTER COLUMN vendor_id DROP NOT NULL;

ALTER TABLE purchase_invoices
  DROP CONSTRAINT IF EXISTS purchase_invoices_division_fk;

ALTER TABLE purchase_invoices
  ADD CONSTRAINT purchase_invoices_division_fk
  FOREIGN KEY (account_id, division_id)
  REFERENCES divisions(account_id, id)
  ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_purchase_invoices_division
  ON purchase_invoices(division_id)
  WHERE division_id IS NOT NULL;

ALTER TABLE purchase_invoices
  DROP CONSTRAINT IF EXISTS purchase_invoices_party_chk;

ALTER TABLE purchase_invoices
  ADD CONSTRAINT purchase_invoices_party_chk
  CHECK (vendor_id IS NOT NULL OR division_id IS NOT NULL);

------------------------------------------------------------------------
-- 4) purchase_invoice_items.division_id
------------------------------------------------------------------------
ALTER TABLE purchase_invoice_items
  ADD COLUMN IF NOT EXISTS division_id uuid;

ALTER TABLE purchase_invoice_items
  DROP CONSTRAINT IF EXISTS purchase_invoice_items_division_fk;

ALTER TABLE purchase_invoice_items
  ADD CONSTRAINT purchase_invoice_items_division_fk
  FOREIGN KEY (account_id, division_id)
  REFERENCES divisions(account_id, id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_items_division
  ON purchase_invoice_items(division_id)
  WHERE division_id IS NOT NULL;

------------------------------------------------------------------------
-- 5) purchase_returns: division + nullable vendor
------------------------------------------------------------------------
ALTER TABLE purchase_returns
  ADD COLUMN IF NOT EXISTS division_id uuid,
  ADD COLUMN IF NOT EXISTS division_name text;

ALTER TABLE purchase_returns
  ALTER COLUMN vendor_id DROP NOT NULL;

ALTER TABLE purchase_returns
  DROP CONSTRAINT IF EXISTS purchase_returns_division_fk;

ALTER TABLE purchase_returns
  ADD CONSTRAINT purchase_returns_division_fk
  FOREIGN KEY (account_id, division_id)
  REFERENCES divisions(account_id, id)
  ON DELETE SET NULL;

ALTER TABLE purchase_returns
  DROP CONSTRAINT IF EXISTS purchase_returns_party_chk;

ALTER TABLE purchase_returns
  ADD CONSTRAINT purchase_returns_party_chk
  CHECK (vendor_id IS NOT NULL OR division_id IS NOT NULL);

------------------------------------------------------------------------
-- 6) division_payments
------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS division_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  division_id uuid NOT NULL,
  mfg_company_id uuid,
  purchase_invoice_id uuid NOT NULL,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  payment_mode payment_mode_type NOT NULL DEFAULT 'NEFT',
  reference_number text,
  notes text,
  created_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT division_payments_division_fk
    FOREIGN KEY (account_id, division_id)
    REFERENCES divisions(account_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT division_payments_invoice_fk
    FOREIGN KEY (purchase_invoice_id)
    REFERENCES purchase_invoices(id)
    ON DELETE RESTRICT,
  CONSTRAINT division_payments_mfg_fk
    FOREIGN KEY (account_id, mfg_company_id)
    REFERENCES mfg_companies(account_id, id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_div_payments_division ON division_payments(division_id);
CREATE INDEX IF NOT EXISTS idx_div_payments_invoice ON division_payments(purchase_invoice_id);
CREATE INDEX IF NOT EXISTS idx_div_payments_mfg ON division_payments(mfg_company_id);

DROP TRIGGER IF EXISTS trg_division_payments_updated_at ON division_payments;
CREATE TRIGGER trg_division_payments_updated_at
BEFORE UPDATE ON division_payments
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

------------------------------------------------------------------------
-- 7) Product name unique per manufacturer (active rows, mfg set)
------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS products_name_per_mfg_unique
  ON products(account_id, mfg_company_id, lower(name))
  WHERE deleted_at IS NULL AND mfg_company_id IS NOT NULL;

------------------------------------------------------------------------
-- 8) Permissions
------------------------------------------------------------------------
INSERT INTO permission_resources(resource, display_name, description, sort_order) VALUES
  ('DIVISIONS', 'Divisions', 'Manage supplier divisions under manufacturers', 25),
  ('DIVISION_PAYMENTS', 'Division Payments', 'Record payments to divisions', 55)
ON CONFLICT (resource) DO UPDATE
SET display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order;

INSERT INTO user_role_permissions (role_id, resource, can_add, can_view, can_update, can_delete)
SELECT role_id, 'DIVISIONS', can_add, can_view, can_update, can_delete
FROM user_role_permissions
WHERE resource = 'VENDORS'
ON CONFLICT (role_id, resource) DO NOTHING;

INSERT INTO user_role_permissions (role_id, resource, can_add, can_view, can_update, can_delete)
SELECT role_id, 'DIVISION_PAYMENTS', can_add, can_view, can_update, can_delete
FROM user_role_permissions
WHERE resource = 'VENDOR_PAYMENTS'
ON CONFLICT (role_id, resource) DO NOTHING;
