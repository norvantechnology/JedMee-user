-- 028_product_low_stock_alerts.sql
-- Product-level + batch-level low stock alert controls.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS low_stock_alert_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS low_stock_threshold numeric(12,3) NOT NULL DEFAULT 0;

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_low_stock_threshold_non_negative,
  ADD CONSTRAINT products_low_stock_threshold_non_negative
  CHECK (low_stock_threshold >= 0);

ALTER TABLE product_batches
  ADD COLUMN IF NOT EXISTS low_stock_alert_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS low_stock_threshold numeric(12,3) NOT NULL DEFAULT 0;

ALTER TABLE product_batches
  DROP CONSTRAINT IF EXISTS product_batches_low_stock_threshold_non_negative,
  ADD CONSTRAINT product_batches_low_stock_threshold_non_negative
  CHECK (low_stock_threshold >= 0);

