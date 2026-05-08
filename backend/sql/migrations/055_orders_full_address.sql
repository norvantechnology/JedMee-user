-- 055_orders_full_address.sql
-- Extend orders table with structured delivery address fields.
-- Stored at order-placement time from the retailer's profile (editable before placing).

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_city    TEXT,
  ADD COLUMN IF NOT EXISTS delivery_pincode TEXT,
  ADD COLUMN IF NOT EXISTS delivery_state   TEXT,
  ADD COLUMN IF NOT EXISTS delivery_country TEXT;