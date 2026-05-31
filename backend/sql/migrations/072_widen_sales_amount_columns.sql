-- 072_widen_sales_amount_columns.sql (fixed version)
-- Drops all dependent views, widens columns, recreates views.

BEGIN;

-- ── Step 1: Capture and drop all dependent views ──────────────────────
DO $$
DECLARE
  v_name TEXT;
  v_def  TEXT;
BEGIN
  -- Store view definitions in a temp table so we can recreate them
  CREATE TEMP TABLE _dropped_views (view_name TEXT, view_def TEXT);

  FOR v_name, v_def IN
    SELECT DISTINCT v.table_name, v.view_definition
    FROM information_schema.view_column_usage u
    JOIN information_schema.views v
      ON v.table_schema = u.view_schema
     AND v.table_name  = u.view_name
    WHERE u.table_schema = 'public'
      AND u.table_name IN (
        'sales_invoices','sales_invoice_items',
        'sales_returns','sales_return_items','customer_payments'
      )
  LOOP
    INSERT INTO _dropped_views VALUES (v_name, v_def);
    EXECUTE 'DROP VIEW IF EXISTS public.' || quote_ident(v_name) || ' CASCADE';
    RAISE NOTICE 'Dropped view: %', v_name;
  END LOOP;
END$$;

-- ── Step 2: Widen all columns ─────────────────────────────────────────
ALTER TABLE sales_invoices
  ALTER COLUMN subtotal       TYPE numeric(14,2) USING ROUND(subtotal::numeric,2),
  ALTER COLUMN total_discount TYPE numeric(14,2) USING ROUND(total_discount::numeric,2),
  ALTER COLUMN total_gst      TYPE numeric(14,2) USING ROUND(total_gst::numeric,2),
  ALTER COLUMN total_amount   TYPE numeric(14,2) USING ROUND(total_amount::numeric,2),
  ALTER COLUMN amount_paid    TYPE numeric(14,2) USING ROUND(amount_paid::numeric,2),
  ALTER COLUMN balance_due    TYPE numeric(14,2) USING ROUND(balance_due::numeric,2);

ALTER TABLE sales_invoice_items
  ALTER COLUMN discount_amount TYPE numeric(14,2) USING ROUND(discount_amount::numeric,2),
  ALTER COLUMN gst_amount      TYPE numeric(14,2) USING ROUND(gst_amount::numeric,2),
  ALTER COLUMN taxable_amount  TYPE numeric(14,2) USING ROUND(taxable_amount::numeric,2),
  ALTER COLUMN line_total      TYPE numeric(14,2) USING ROUND(line_total::numeric,2);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='sales_invoice_items'
      AND column_name='cgst_amount'
  ) THEN
    ALTER TABLE sales_invoice_items
      ALTER COLUMN cgst_amount TYPE numeric(14,2) USING ROUND(cgst_amount::numeric,2),
      ALTER COLUMN sgst_amount TYPE numeric(14,2) USING ROUND(sgst_amount::numeric,2),
      ALTER COLUMN igst_amount TYPE numeric(14,2) USING ROUND(igst_amount::numeric,2);
  END IF;
END$$;

ALTER TABLE sales_returns
  ALTER COLUMN total_return_amount TYPE numeric(14,2)
    USING ROUND(total_return_amount::numeric,2);

ALTER TABLE sales_return_items
  ALTER COLUMN return_amount TYPE numeric(14,2)
    USING ROUND(return_amount::numeric,2);

ALTER TABLE customer_payments
  ALTER COLUMN amount TYPE numeric(14,2)
    USING ROUND(amount::numeric,2);

-- ── Step 3: Recreate all dropped views ───────────────────────────────
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT view_name, view_def FROM _dropped_views LOOP
    BEGIN
      EXECUTE 'CREATE OR REPLACE VIEW public.'
              || quote_ident(r.view_name)
              || ' AS ' || r.view_def;
      RAISE NOTICE 'Recreated view: %', r.view_name;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Could not recreate view %: %', r.view_name, SQLERRM;
    END;
  END LOOP;
  DROP TABLE _dropped_views;
END$$;

COMMIT;