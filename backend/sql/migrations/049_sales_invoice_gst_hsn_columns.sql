-- Migration 049: Add HSN code + GST breakdown columns to sales_invoice_items.
-- These columns are required by the GSTR-1 summary report.
-- All additions use IF NOT EXISTS so the migration is safe to re-run.
--
-- NOTE: sales_invoices already has total_gst (from migration 021) and
-- subtotal / total_discount for taxable value — no new columns needed there.

-- ── sales_invoice_items ───────────────────────────────────────────────────────

ALTER TABLE sales_invoice_items
  ADD COLUMN IF NOT EXISTS hsn_code       TEXT,
  ADD COLUMN IF NOT EXISTS taxable_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cgst_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgst_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igst_amount    NUMERIC(14,2) NOT NULL DEFAULT 0;

-- ── products ──────────────────────────────────────────────────────────────────
-- hsn_code may already exist from migration 035; IF NOT EXISTS keeps it safe.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS hsn_code TEXT;

-- ── Backfill existing sales_invoice_items ─────────────────────────────────────
-- Derive taxable_amount from the existing line_total and gst_amount columns
-- so that historical data is usable in the GSTR-1 report immediately.
-- Formula: taxable_amount = line_total - gst_amount  (both stored on the row)

UPDATE sales_invoice_items
SET    taxable_amount = GREATEST(0, COALESCE(line_total, 0) - COALESCE(gst_amount, 0))
WHERE  taxable_amount = 0
  AND  COALESCE(line_total, 0) > 0;

-- Backfill cgst/sgst as half of gst_amount each (intra-state assumption).
-- igst stays 0 (inter-state invoices are rare for local pharmacy; can be
-- corrected manually or via a future migration once igst flag is tracked).
UPDATE sales_invoice_items
SET    cgst_amount = ROUND(COALESCE(gst_amount, 0) / 2, 2),
       sgst_amount = ROUND(COALESCE(gst_amount, 0) / 2, 2)
WHERE  cgst_amount = 0
  AND  sgst_amount = 0
  AND  COALESCE(gst_amount, 0) > 0;