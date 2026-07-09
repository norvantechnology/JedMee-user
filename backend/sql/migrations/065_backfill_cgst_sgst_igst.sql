-- Migration 065: Backfill cgst_amount / sgst_amount / igst_amount on confirmed
-- sales_invoice_items where gst_amount > 0 but the split columns are all zero.
--
-- Root cause: prior to this fix, CASH_MEMO invoices only stored gst_amount
-- (total GST) but not the CGST/SGST/IGST split. GSTR-3B and GSTR-1 reports
-- require the split. This migration derives the split from supply_type on the
-- parent invoice (INTRA_STATE → CGST+SGST, INTER_STATE → IGST).
--
-- Safe to re-run: only touches rows where the split is missing.

UPDATE sales_invoice_items sii
SET
  cgst_amount = CASE
    WHEN COALESCE(si.supply_type, 'INTRA_STATE') = 'INTER_STATE' THEN 0
    ELSE ROUND(sii.gst_amount / 2, 4)
  END,
  sgst_amount = CASE
    WHEN COALESCE(si.supply_type, 'INTRA_STATE') = 'INTER_STATE' THEN 0
    ELSE ROUND(sii.gst_amount / 2, 4)
  END,
  igst_amount = CASE
    WHEN COALESCE(si.supply_type, 'INTRA_STATE') = 'INTER_STATE' THEN ROUND(sii.gst_amount, 4)
    ELSE 0
  END
FROM sales_invoices si
WHERE sii.sales_invoice_id = si.id
  AND si.status = 'CONFIRMED'
  AND si.deleted_at IS NULL
  AND COALESCE(sii.gst_amount, 0) > 0
  AND COALESCE(sii.cgst_amount, 0) = 0
  AND COALESCE(sii.sgst_amount, 0) = 0
  AND COALESCE(sii.igst_amount, 0) = 0;

-- Also fix the gstrB2bB2c report: update B2B invoice CGST/SGST/IGST fallback
-- by ensuring the sales_invoices.total_gst is consistent with line items.
-- (No change needed to sales_invoices.total_gst - it already stores total GST correctly.)

-- Verify: count of rows fixed (informational only)
-- SELECT COUNT(*) FROM sales_invoice_items WHERE cgst_amount > 0 OR sgst_amount > 0 OR igst_amount > 0;