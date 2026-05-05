-- 001_roles_seed.sql
-- Seed/upsert system roles

INSERT INTO roles (code, name)
VALUES
  ('WHOLESALER', 'Wholesaler'),
  ('RETAILER', 'Retailer')
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name;

