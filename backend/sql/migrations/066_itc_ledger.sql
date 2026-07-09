-- 066_itc_ledger.sql
-- GSTR-2 / ITC Report Module
-- Adds:
--   1) supply_type, itc_eligible, reversal_required, reversal_date, rcm_applicable to purchase_invoices
--   2) is_composition_dealer, state_code to vendors
--   3) itc_ledger table (monthly ITC carry-forward ledger)
--   4) itc_reversal_log table (audit trail for all ITC reversals)
-- All additions use IF NOT EXISTS so the migration is safe to re-run.

------------------------------------------------------------------------
-- 1) purchase_invoices: add ITC tracking columns
------------------------------------------------------------------------
ALTER TABLE purchase_invoices
  ADD COLUMN IF NOT EXISTS supply_type         TEXT NOT NULL DEFAULT 'INTRA_STATE'
                                               CHECK (supply_type IN ('INTRA_STATE','INTER_STATE')),
  ADD COLUMN IF NOT EXISTS itc_eligible        BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reversal_required   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reversal_date       DATE,
  ADD COLUMN IF NOT EXISTS rcm_applicable      BOOLEAN NOT NULL DEFAULT false;

-- Backfill supply_type from purchase_invoice_items:
-- If any line item has igst_amount > 0 → INTER_STATE, else INTRA_STATE
UPDATE purchase_invoices pi
SET supply_type = 'INTER_STATE'
WHERE EXISTS (
  SELECT 1 FROM purchase_invoice_items pii
  WHERE pii.purchase_invoice_id = pi.id
    AND COALESCE(pii.igst_amount, 0) > 0
)
AND supply_type = 'INTRA_STATE';

-- Backfill itc_eligible from vendor gst_number
UPDATE purchase_invoices pi
SET itc_eligible = false
FROM vendors v
WHERE v.id = pi.vendor_id
  AND v.account_id = pi.account_id
  AND COALESCE(v.gst_number, '') = '';

-- Backfill reversal_required for invoices unpaid beyond 180 days
UPDATE purchase_invoices
SET reversal_required = true,
    reversal_date     = invoice_date + INTERVAL '180 days'
WHERE status = 'CONFIRMED'
  AND deleted_at IS NULL
  AND payment_status IN ('UNPAID', 'PARTIAL')
  AND invoice_date + INTERVAL '180 days' < CURRENT_DATE
  AND reversal_required = false;

------------------------------------------------------------------------
-- 2) vendors: add composition dealer flag and state code
------------------------------------------------------------------------
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS is_composition_dealer BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS state_code            TEXT;

------------------------------------------------------------------------
-- 3) ITC Ledger - monthly snapshot per account
--    One row per (account_id, year, month).
--    snapshot_locked = true once the month is filed in GSTR-3B.
------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS itc_ledger (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id           uuid        NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  year                 integer     NOT NULL,
  month                integer     NOT NULL CHECK (month BETWEEN 1 AND 12),
  -- Opening balances (carry-forward from previous month)
  opening_cgst         numeric(14,2) NOT NULL DEFAULT 0,
  opening_sgst         numeric(14,2) NOT NULL DEFAULT 0,
  opening_igst         numeric(14,2) NOT NULL DEFAULT 0,
  opening_cess         numeric(14,2) NOT NULL DEFAULT 0,
  -- ITC earned this month (from eligible purchases)
  earned_cgst          numeric(14,2) NOT NULL DEFAULT 0,
  earned_sgst          numeric(14,2) NOT NULL DEFAULT 0,
  earned_igst          numeric(14,2) NOT NULL DEFAULT 0,
  earned_cess          numeric(14,2) NOT NULL DEFAULT 0,
  -- ITC reversed this month (returns + 180-day + blocked)
  reversed_cgst        numeric(14,2) NOT NULL DEFAULT 0,
  reversed_sgst        numeric(14,2) NOT NULL DEFAULT 0,
  reversed_igst        numeric(14,2) NOT NULL DEFAULT 0,
  reversed_cess        numeric(14,2) NOT NULL DEFAULT 0,
  -- Net ITC claimable = opening + earned - reversed
  net_cgst             numeric(14,2) NOT NULL DEFAULT 0,
  net_sgst             numeric(14,2) NOT NULL DEFAULT 0,
  net_igst             numeric(14,2) NOT NULL DEFAULT 0,
  net_cess             numeric(14,2) NOT NULL DEFAULT 0,
  snapshot_locked      boolean     NOT NULL DEFAULT false,
  generated_at         timestamptz NOT NULL DEFAULT now(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT itc_ledger_account_year_month_key
    UNIQUE (account_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_itc_ledger_account
  ON itc_ledger(account_id);

CREATE INDEX IF NOT EXISTS idx_itc_ledger_year_month
  ON itc_ledger(account_id, year DESC, month DESC);

------------------------------------------------------------------------
-- 4) ITC Reversal Log - audit trail for every ITC reversal event
------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS itc_reversal_log (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id           uuid        NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  purchase_invoice_id  uuid        REFERENCES purchase_invoices(id) ON DELETE SET NULL,
  purchase_return_id   uuid        REFERENCES purchase_returns(id) ON DELETE SET NULL,
  reversal_type        text        NOT NULL
                                   CHECK (reversal_type IN ('PURCHASE_RETURN','180_DAY_RULE','BLOCKED_CREDIT','RCM')),
  reversal_date        date        NOT NULL DEFAULT CURRENT_DATE,
  cgst_reversed        numeric(14,2) NOT NULL DEFAULT 0,
  sgst_reversed        numeric(14,2) NOT NULL DEFAULT 0,
  igst_reversed        numeric(14,2) NOT NULL DEFAULT 0,
  cess_reversed        numeric(14,2) NOT NULL DEFAULT 0,
  reason               text,
  created_by_user_id   uuid        REFERENCES app_users(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_itc_reversal_log_account
  ON itc_reversal_log(account_id);

CREATE INDEX IF NOT EXISTS idx_itc_reversal_log_invoice
  ON itc_reversal_log(purchase_invoice_id)
  WHERE purchase_invoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_itc_reversal_log_return
  ON itc_reversal_log(purchase_return_id)
  WHERE purchase_return_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_itc_reversal_log_date
  ON itc_reversal_log(account_id, reversal_date DESC);