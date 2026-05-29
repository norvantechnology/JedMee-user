-- Sync sales invoice payment_mode from recorded customer payments; add purchase invoice payment_mode.

ALTER TABLE purchase_invoices
  ADD COLUMN IF NOT EXISTS payment_mode TEXT DEFAULT 'CREDIT'
    CHECK (payment_mode IN ('CASH', 'UPI', 'CARD', 'CHEQUE', 'NEFT', 'CREDIT', 'ADVANCE', 'OTHER'));

-- Backfill sales: latest invoice-linked payment mode, else CREDIT when unpaid.
UPDATE sales_invoices si
SET payment_mode = sub.mode
FROM (
  SELECT
    si2.id,
    CASE
      WHEN si2.payment_status = 'PAID'::sales_payment_status OR si2.payment_status = 'PARTIAL'::sales_payment_status THEN
        COALESCE(
          (
            SELECT cp.payment_mode::text
            FROM customer_payments cp
            WHERE cp.sales_invoice_id = si2.id
              AND cp.account_id = si2.account_id
              AND COALESCE(cp.allocation_type, 'INVOICE') = 'INVOICE'
            ORDER BY cp.payment_date DESC, cp.created_at DESC
            LIMIT 1
          ),
          'CASH'
        )
      ELSE 'CREDIT'
    END AS mode
  FROM sales_invoices si2
  WHERE si2.deleted_at IS NULL
) sub
WHERE si.id = sub.id
  AND si.deleted_at IS NULL
  AND COALESCE(si.payment_mode, '') IS DISTINCT FROM sub.mode;

-- Backfill purchase payment_mode from vendor/division payments.
UPDATE purchase_invoices pi
SET payment_mode = sub.mode
FROM (
  SELECT
    pi2.id,
    CASE
      WHEN pi2.payment_status IN ('PAID', 'PARTIAL') THEN
        COALESCE(
          (
            SELECT vp.payment_mode::text
            FROM vendor_payments vp
            WHERE vp.purchase_invoice_id = pi2.id
              AND vp.account_id = pi2.account_id
              AND COALESCE(vp.allocation_type, 'INVOICE') = 'INVOICE'
            ORDER BY vp.payment_date DESC, vp.created_at DESC
            LIMIT 1
          ),
          (
            SELECT dp.payment_mode::text
            FROM division_payments dp
            WHERE dp.purchase_invoice_id = pi2.id
              AND dp.account_id = pi2.account_id
            ORDER BY dp.payment_date DESC, dp.created_at DESC
            LIMIT 1
          ),
          'CASH'
        )
      ELSE 'CREDIT'
    END AS mode
  FROM purchase_invoices pi2
  WHERE pi2.deleted_at IS NULL
) sub
WHERE pi.id = sub.id
  AND pi.deleted_at IS NULL
  AND COALESCE(pi.payment_mode, '') IS DISTINCT FROM sub.mode;
