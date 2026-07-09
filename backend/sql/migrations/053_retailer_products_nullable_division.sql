-- 053_retailer_products_nullable_division.sql
-- Retailers (pharmacies) do not use the division/manufacturer hierarchy.
-- Migration 033 conditionally set products.division_id NOT NULL when all
-- existing products had a division backfilled. On a fresh DB that condition
-- is always met, so the column ends up NOT NULL even though RETAILER accounts
-- legitimately create products with no division.
--
-- Fix: drop the NOT NULL constraint so RETAILER accounts can insert products
-- without a division_id. The FK (products_division_fk) is kept - when a
-- division_id IS supplied it must still reference a valid division row.
--
-- Also adds a DB-level unique index for retailer products (mfg_company_id IS
-- NULL) so product names remain unique per account even without a manufacturer.
-- Idempotent: safe to re-run.

------------------------------------------------------------------------
-- 1) Make products.division_id nullable
------------------------------------------------------------------------
ALTER TABLE products ALTER COLUMN division_id DROP NOT NULL;

------------------------------------------------------------------------
-- 2) Unique product name per account when no manufacturer is set
--    (covers RETAILER accounts that skip the mfg/division hierarchy)
------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS products_name_per_account_no_mfg_unique
  ON products(account_id, lower(name))
  WHERE deleted_at IS NULL AND mfg_company_id IS NULL;