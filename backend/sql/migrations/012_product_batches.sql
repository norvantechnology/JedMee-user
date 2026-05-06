-- 012_product_batches.sql
-- Quality Master / Product Batch Management (account scoped)

CREATE TABLE IF NOT EXISTS product_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,

  product_code text NOT NULL,
  product_name text NOT NULL,
  drug_name text,
  batch_no text NOT NULL,

  barcode text,

  expiry_date date NOT NULL,
  mfg_date date,

  -- Pricing
  mrp numeric(12,2),
  purchase_rate numeric(12,2),
  sales_rate numeric(12,2),
  retail_rate numeric(12,2),
  net_rate numeric(12,2),
  landing_cost numeric(12,2),

  -- Discount & scheme
  discount_sales numeric(12,2),
  discount_purchase numeric(12,2),
  retail_discount_percent numeric(8,3),
  net_discount_percent numeric(8,3),
  sales_scheme text,
  scheme_qty_paid numeric(12,3),
  scheme_qty_free numeric(12,3),

  -- Tax
  sales_gst numeric(8,3),
  purchase_gst numeric(8,3),

  -- Stock
  opening_stock numeric(12,3),
  open_stock_free_qty numeric(12,3),
  stockable boolean NOT NULL DEFAULT true,
  conversion_unit numeric(12,3),

  -- Packing
  packing text,
  bulk_pack text,
  case_pack text,

  -- Flags
  is_discount_enabled boolean NOT NULL DEFAULT true,
  is_hold boolean NOT NULL DEFAULT false,
  is_half_scheme boolean NOT NULL DEFAULT false,
  is_net boolean NOT NULL DEFAULT false,
  is_non_editable_free_qty boolean NOT NULL DEFAULT false,
  is_control boolean NOT NULL DEFAULT false,

  created_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- Uniqueness / lookup (account scoped)
CREATE UNIQUE INDEX IF NOT EXISTS product_batches_account_product_code_key ON product_batches (account_id, lower(product_code));
CREATE UNIQUE INDEX IF NOT EXISTS product_batches_account_product_batch_key ON product_batches (account_id, lower(product_code), lower(batch_no));
CREATE UNIQUE INDEX IF NOT EXISTS product_batches_account_barcode_key ON product_batches (account_id, barcode) WHERE barcode IS NOT NULL AND barcode <> '';

-- Seed permission resource for RBAC
INSERT INTO permission_resources(resource)
VALUES ('PRODUCT_BATCHES')
ON CONFLICT (resource) DO NOTHING;

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_product_batches_updated_at ON product_batches;
CREATE TRIGGER trg_product_batches_updated_at
BEFORE UPDATE ON product_batches
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

