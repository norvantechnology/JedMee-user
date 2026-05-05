-- 036_customer_type_extend_doctor.sql
-- Extend customer_type_enum to include DOCTOR so retailer pharmacies can
-- track sales to individual practitioners (samples, personal stock, etc.).
-- Idempotent: ADD VALUE IF NOT EXISTS is a no-op when DOCTOR already exists.

DO $$
BEGIN
  BEGIN
    ALTER TYPE customer_type_enum ADD VALUE IF NOT EXISTS 'DOCTOR';
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END$$;
