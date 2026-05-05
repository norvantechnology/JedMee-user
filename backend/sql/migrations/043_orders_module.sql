-- 043_orders_module.sql
-- B2B Orders marketplace between WHOLESALER and RETAILER accounts.

CREATE TABLE IF NOT EXISTS wholesaler_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  catalog_price numeric(12,2) NOT NULL CHECK (catalog_price > 0),
  mrp numeric(12,2),
  packing text,
  min_order_qty integer NOT NULL DEFAULT 1 CHECK (min_order_qty >= 1),
  max_order_qty integer,
  is_visible boolean NOT NULL DEFAULT true,
  hide_when_out_of_stock boolean NOT NULL DEFAULT true,
  catalog_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  CONSTRAINT wholesaler_catalog_unique UNIQUE (account_id, product_id),
  CONSTRAINT wholesaler_catalog_max_qty_chk CHECK (max_order_qty IS NULL OR max_order_qty >= min_order_qty)
);

CREATE INDEX IF NOT EXISTS idx_catalog_account
  ON wholesaler_catalog(account_id)
  WHERE is_visible = true;
CREATE INDEX IF NOT EXISTS idx_catalog_product ON wholesaler_catalog(product_id);

CREATE TABLE IF NOT EXISTS wholesaler_retailer_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wholesaler_account_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  retailer_account_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('PENDING', 'ACTIVE', 'BLOCKED')),
  credit_days integer NOT NULL DEFAULT 0,
  credit_limit numeric(14,2) NOT NULL DEFAULT 0,
  discount_percent numeric(7,3) NOT NULL DEFAULT 0,
  wholesaler_customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  linked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wholesaler_retailer_link_unique UNIQUE (wholesaler_account_id, retailer_account_id)
);

CREATE INDEX IF NOT EXISTS idx_wsl_wholesaler ON wholesaler_retailer_links(wholesaler_account_id);
CREATE INDEX IF NOT EXISTS idx_wsl_retailer ON wholesaler_retailer_links(retailer_account_id);
CREATE INDEX IF NOT EXISTS idx_wsl_active
  ON wholesaler_retailer_links(wholesaler_account_id, status)
  WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL,
  retailer_account_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  retailer_firm_name text NOT NULL,
  wholesaler_account_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  wholesaler_firm_name text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','ACCEPTED','REJECTED','DISPATCHED','DELIVERED','CANCELLED')),
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  total_discount numeric(14,2) NOT NULL DEFAULT 0,
  total_gst numeric(14,2) NOT NULL DEFAULT 0,
  total_amount numeric(14,2) NOT NULL DEFAULT 0,
  retailer_notes text,
  wholesaler_notes text,
  rejection_reason text,
  cancellation_reason text,
  placed_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  rejected_at timestamptz,
  dispatched_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  accepted_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  rejected_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  dispatched_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  cancelled_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  wholesaler_sales_invoice_id uuid REFERENCES sales_invoices(id) ON DELETE SET NULL,
  retailer_purchase_invoice_id uuid REFERENCES purchase_invoices(id) ON DELETE SET NULL,
  wholesaler_customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_wholesaler_order_number
  ON orders(wholesaler_account_id, lower(order_number));
CREATE INDEX IF NOT EXISTS idx_orders_retailer ON orders(retailer_account_id, status, placed_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_wholesaler ON orders(wholesaler_account_id, status, placed_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_pending
  ON orders(wholesaler_account_id, status)
  WHERE status = 'PENDING';

CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  catalog_id uuid NOT NULL REFERENCES wholesaler_catalog(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_code text NOT NULL,
  product_name text NOT NULL,
  drug_name text,
  packing text,
  batch_id uuid REFERENCES product_batches(id) ON DELETE SET NULL,
  batch_no text,
  ordered_qty integer NOT NULL CHECK (ordered_qty > 0),
  accepted_qty integer,
  unit_price numeric(12,2) NOT NULL,
  mrp numeric(12,2),
  discount_percent numeric(7,3) NOT NULL DEFAULT 0,
  discount_amount numeric(14,2) NOT NULL DEFAULT 0,
  gst_percent numeric(7,3) NOT NULL DEFAULT 0,
  gst_amount numeric(14,2) NOT NULL DEFAULT 0,
  taxable_amount numeric(14,2) NOT NULL DEFAULT 0,
  line_total numeric(14,2) NOT NULL DEFAULT 0,
  free_qty integer NOT NULL DEFAULT 0,
  scheme_description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);

ALTER TABLE invoice_counters
  ADD COLUMN IF NOT EXISTS order_counter integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION sync_catalog_visibility_on_product_soft_delete()
RETURNS trigger AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND (OLD.deleted_at IS NULL OR OLD.deleted_at <> NEW.deleted_at) THEN
    UPDATE wholesaler_catalog
    SET is_visible = false, updated_at = now()
    WHERE account_id = NEW.account_id
      AND product_id = NEW.id
      AND is_visible = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_products_soft_delete_catalog_hide ON products;
CREATE TRIGGER trg_products_soft_delete_catalog_hide
AFTER UPDATE OF deleted_at ON products
FOR EACH ROW
EXECUTE FUNCTION sync_catalog_visibility_on_product_soft_delete();

