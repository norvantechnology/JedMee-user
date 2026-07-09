-- 062_gstr3b_module.sql
-- GSTR3B Monthly Summary Return
-- Adds:
--   1) gst_number to vendors (ITC eligibility check)
--   2) cgst_amount / sgst_amount / igst_amount to purchase_invoice_items
--   3) gstr3b_snapshots table (monthly snapshot + lock/file flag)
-- All additions use IF NOT EXISTS so the migration is safe to re-run.

------------------------------------------------------------------------
-- 1) Vendors: add GST number for ITC eligibility
------------------------------------------------------------------------
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS gst_number TEXT;

CREATE INDEX IF NOT EXISTS idx_vendors_gst_number
  ON vendors(account_id, gst_number)
  WHERE gst_number IS NOT NULL AND gst_number <> '';

------------------------------------------------------------------------
-- 2) purchase_invoice_items: add CGST / SGST / IGST breakdown
------------------------------------------------------------------------
ALTER TABLE purchase_invoice_items
  ADD COLUMN IF NOT EXISTS cgst_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgst_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igst_amount NUMERIC(14,2) NOT NULL DEFAULT 0;

-- Backfill existing rows: split gst_amount equally into cgst/sgst
-- (intra-state assumption - igst stays 0 for local pharmacy purchases).
UPDATE purchase_invoice_items
SET    cgst_amount = ROUND(COALESCE(gst_amount, 0) / 2, 2),
       sgst_amount = ROUND(COALESCE(gst_amount, 0) / 2, 2)
WHERE  cgst_amount = 0
  AND  sgst_amount = 0
  AND  COALESCE(gst_amount, 0) > 0;

------------------------------------------------------------------------
-- 3) GSTR3B snapshots table
--    One row per (account_id, year, month).
--    status = 'DRAFT'  → live calculation (can be regenerated)
--    status = 'FILED'  → locked; snapshot_data is frozen
------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gstr3b_snapshots (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id           uuid        NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  year                 integer     NOT NULL,
  month                integer     NOT NULL CHECK (month BETWEEN 1 AND 12),
  status               text        NOT NULL DEFAULT 'DRAFT'
                                   CHECK (status IN ('DRAFT', 'FILED')),
  due_date             date,
  filed_at             timestamptz,
  filed_by_user_id     uuid        REFERENCES app_users(id) ON DELETE SET NULL,
  -- Full frozen report payload (all sections) stored as JSONB
  snapshot_data        jsonb,
  -- ITC carry-forward amounts written when the month is filed
  carry_forward_cgst   numeric(14,2) NOT NULL DEFAULT 0,
  carry_forward_sgst   numeric(14,2) NOT NULL DEFAULT 0,
  carry_forward_igst   numeric(14,2) NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gstr3b_snapshots_account_year_month_key
    UNIQUE (account_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_gstr3b_snapshots_account
  ON gstr3b_snapshots(account_id);

CREATE INDEX IF NOT EXISTS idx_gstr3b_snapshots_year_month
  ON gstr3b_snapshots(account_id, year DESC, month DESC);