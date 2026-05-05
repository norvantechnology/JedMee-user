-- 011_vendors_phone_compat.sql
-- Backward-compatible vendor phone column.
-- Some older code paths may still select `vendors.phone`.
-- We generate it from (phone_country_code, phone_number) so it's always consistent.

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS phone text
  GENERATED ALWAYS AS (
    NULLIF(COALESCE(phone_country_code, '') || COALESCE(phone_number, ''), '')
  ) STORED;

