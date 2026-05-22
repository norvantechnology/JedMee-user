-- Migration 063: B2B / B2C tagging for GSTR-1 segregation report.
-- Adds tagging columns to sales_invoices and helper columns to customers.
-- All additions use IF NOT EXISTS so the migration is safe to re-run.

-- ── sales_invoices ────────────────────────────────────────────────────────────

ALTER TABLE sales_invoices
  -- 'B2B' = customer has valid GSTIN; 'B2C' = no GSTIN / walk-in
  ADD COLUMN IF NOT EXISTS b2b_b2c_tag          TEXT NOT NULL DEFAULT 'B2C'
    CHECK (b2b_b2c_tag IN ('B2B','B2C')),
  -- true when B2C invoice total_amount > 250000 (must be reported individually in GSTR-1)
  ADD COLUMN IF NOT EXISTS large_b2c_flag        BOOLEAN NOT NULL DEFAULT FALSE,
  -- state code of customer at time of invoice creation (determines IGST vs CGST+SGST)
  ADD COLUMN IF NOT EXISTS place_of_supply       TEXT,
  -- 'INTRA_STATE' or 'INTER_STATE'
  ADD COLUMN IF NOT EXISTS supply_type           TEXT
    CHECK (supply_type IS NULL OR supply_type IN ('INTRA_STATE','INTER_STATE')),
  -- snapshot of customer GSTIN at time of invoice creation (immutable after creation)
  ADD COLUMN IF NOT EXISTS customer_gstin_snapshot TEXT,
  -- true if the tag was manually re-applied after invoice creation
  ADD COLUMN IF NOT EXISTS gstin_re_tagged       BOOLEAN NOT NULL DEFAULT FALSE,
  -- JSON array of re-tag audit entries: [{at, by_user_id, old_tag, new_tag, reason}]
  ADD COLUMN IF NOT EXISTS re_tag_audit_log      JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ── customers ─────────────────────────────────────────────────────────────────

ALTER TABLE customers
  -- timestamp when GSTIN was last validated (set on customer save)
  ADD COLUMN IF NOT EXISTS gstin_validated_at    TIMESTAMPTZ,
  -- 2-digit state code derived from GSTIN prefix or manually set
  ADD COLUMN IF NOT EXISTS state_code            TEXT,
  -- auto-set: true when gst_number is present and passes format check
  ADD COLUMN IF NOT EXISTS b2b_flag              BOOLEAN NOT NULL DEFAULT FALSE;

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_sales_b2b_b2c_tag
  ON sales_invoices(account_id, b2b_b2c_tag, invoice_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sales_large_b2c
  ON sales_invoices(account_id, large_b2c_flag, invoice_date)
  WHERE deleted_at IS NULL AND b2b_b2c_tag = 'B2C';

-- ── Backfill existing sales_invoices ─────────────────────────────────────────
-- Tag as B2B if customer_gst is present (non-null, non-empty).
-- customer_gstin_snapshot mirrors customer_gst for historical invoices.

UPDATE sales_invoices
SET
  b2b_b2c_tag           = CASE
                            WHEN COALESCE(TRIM(customer_gst), '') <> '' THEN 'B2B'
                            ELSE 'B2C'
                          END,
  customer_gstin_snapshot = NULLIF(TRIM(COALESCE(customer_gst, '')), ''),
  large_b2c_flag        = CASE
                            WHEN COALESCE(TRIM(customer_gst), '') = ''
                             AND COALESCE(total_amount, 0) > 250000
                            THEN TRUE
                            ELSE FALSE
                          END
WHERE b2b_b2c_tag = 'B2C'   -- only rows not yet tagged (default value)
  AND customer_gstin_snapshot IS NULL;

-- ── Backfill customers.b2b_flag ───────────────────────────────────────────────

UPDATE customers
SET b2b_flag = (COALESCE(TRIM(gst_number), '') <> '')
WHERE b2b_flag = FALSE;

-- ── Backfill customers.state_code from GSTIN prefix ──────────────────────────
-- GSTIN first 2 chars = state code (e.g. '29' for Karnataka).

UPDATE customers
SET state_code = SUBSTRING(TRIM(gst_number) FROM 1 FOR 2)
WHERE state_code IS NULL
  AND COALESCE(TRIM(gst_number), '') <> ''
  AND LENGTH(TRIM(gst_number)) = 15;