-- 054_orders_delivery_fields.sql
-- Add delivery contact fields to orders table.
-- Stored at order-placement time from the retailer's profile (editable before placing).

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_address   TEXT,
  ADD COLUMN IF NOT EXISTS delivery_phone     TEXT,
  ADD COLUMN IF NOT EXISTS retailer_gst_number TEXT;