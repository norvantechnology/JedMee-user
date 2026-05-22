-- Migration 064: Add B2B/B2C tag to sales_returns for GSTR-1 credit/debit note segregation.
-- Credit notes (sales returns) must carry the same B2B/B2C tag as the original invoice
-- so they are reflected in the correct GSTR-1 section (CDNR for B2B, CDNUR for B2C).

-- ── sales_returns ─────────────────────────────────────────────────────────────

ALTER TABLE sales_returns
  -- 'B2B' = return for a GST-registered customer; 'B2C' = unregistered / walk-in
  ADD COLUMN IF NOT EXISTS b2b_b2c_tag          TEXT NOT NULL DEFAULT 'B2C'
    CHECK (b2b_b2c_tag IN ('B2B','B2C')),
  -- snapshot of customer GSTIN at time of return creation (mirrors original invoice)
  ADD COLUMN IF NOT EXISTS customer_gstin_snapshot TEXT,
  -- place of supply (state code) — mirrors original invoice
  ADD COLUMN IF NOT EXISTS place_of_supply       TEXT,
  -- 'INTRA_STATE' or 'INTER_STATE' — mirrors original invoice
  ADD COLUMN IF NOT EXISTS supply_type           TEXT
    CHECK (supply_type IS NULL OR supply_type IN ('INTRA_STATE','INTER_STATE'));

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_sales_returns_b2b_b2c_tag
  ON sales_returns(account_id, b2b_b2c_tag, return_date)
  WHERE deleted_at IS NULL;

-- ── Backfill existing sales_returns from linked sales_invoices ────────────────
-- For returns linked to an invoice, copy the invoice's B2B/B2C tag.
-- For unlinked returns, derive from customer GSTIN.

UPDATE sales_returns sr
SET
  b2b_b2c_tag           = COALESCE(si.b2b_b2c_tag, 'B2C'),
  customer_gstin_snapshot = si.customer_gstin_snapshot,
  place_of_supply       = si.place_of_supply,
  supply_type           = si.supply_type
FROM sales_invoices si
WHERE sr.sales_invoice_id = si.id
  AND sr.b2b_b2c_tag = 'B2C'
  AND sr.customer_gstin_snapshot IS NULL;

-- For returns NOT linked to an invoice — derive from customer GSTIN
UPDATE sales_returns sr
SET
  b2b_b2c_tag           = CASE
                            WHEN COALESCE(TRIM(c.gst_number), '') <> '' THEN 'B2B'
                            ELSE 'B2C'
                          END,
  customer_gstin_snapshot = NULLIF(TRIM(COALESCE(c.gst_number, '')), ''),
  place_of_supply       = CASE
                            WHEN COALESCE(TRIM(c.gst_number), '') <> '' AND LENGTH(TRIM(c.gst_number)) = 15
                            THEN SUBSTRING(TRIM(c.gst_number) FROM 1 FOR 2)
                            ELSE c.state_code
                          END
FROM customers c
WHERE sr.customer_id = c.id
  AND sr.sales_invoice_id IS NULL
  AND sr.b2b_b2c_tag = 'B2C'
  AND sr.customer_gstin_snapshot IS NULL;