-- 032_divisions_vendor_data_backfill.sql
-- Optional one-time backfill for accounts that had vendors + batches/invoices before divisions.
-- Safe to run multiple times: skips rows that already have divisions / division_id set.

------------------------------------------------------------------------
-- 1) Create divisions from vendors (requires mfg_company_id), name unique per mfg
------------------------------------------------------------------------
INSERT INTO divisions (
  account_id, code, name, short_name, mfg_company_id,
  credit_days, is_active,
  phone_country_code, phone_number, email, address, notes,
  created_at, updated_at, created_by_user_id
)
SELECT
  v.account_id,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM divisions d2
      WHERE d2.account_id = v.account_id AND d2.deleted_at IS NULL
        AND lower(trim(d2.code)) = lower(trim(v.code))
    ) THEN 'DIV-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)
    ELSE upper(regexp_replace(trim(v.code), '\s+', '-', 'g'))
  END AS code,
  trim(v.name) AS name,
  NULLIF(trim(v.short_name), '') AS short_name,
  v.mfg_company_id,
  COALESCE(v.credit_days, 0),
  COALESCE(v.is_active, true),
  COALESCE(v.phone_country_code, '+91'),
  NULLIF(trim(v.phone_number), ''),
  NULLIF(lower(trim(v.email)), ''),
  NULLIF(trim(v.address), ''),
  NULLIF(trim(v.notes), ''),
  v.created_at,
  v.updated_at,
  v.created_by_user_id
FROM vendors v
WHERE v.deleted_at IS NULL
  AND v.mfg_company_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM divisions d
    WHERE d.account_id = v.account_id AND d.deleted_at IS NULL
      AND d.mfg_company_id = v.mfg_company_id
      AND lower(trim(d.name)) = lower(trim(v.name))
  );

------------------------------------------------------------------------
-- 2) Link product_batches to division via vendor name + mfg match
------------------------------------------------------------------------
UPDATE product_batches pb
SET division_id = d.id
FROM divisions d
INNER JOIN vendors v ON v.account_id = d.account_id
  AND v.mfg_company_id = d.mfg_company_id
  AND lower(trim(v.name)) = lower(trim(d.name))
  AND v.deleted_at IS NULL
WHERE pb.vendor_id = v.id
  AND pb.account_id = v.account_id
  AND pb.deleted_at IS NULL
  AND pb.division_id IS NULL;

------------------------------------------------------------------------
-- 3) Link purchase invoices + snapshot division_name
------------------------------------------------------------------------
UPDATE purchase_invoices pi
SET division_id = d.id,
    division_name = d.name
FROM divisions d
INNER JOIN vendors v ON v.account_id = d.account_id
  AND v.mfg_company_id = d.mfg_company_id
  AND lower(trim(v.name)) = lower(trim(d.name))
  AND v.deleted_at IS NULL
WHERE pi.vendor_id = v.id
  AND pi.account_id = v.account_id
  AND pi.deleted_at IS NULL
  AND pi.division_id IS NULL;

------------------------------------------------------------------------
-- 4) Move vendor_payments → division_payments for invoices tied to a division,
--    then remove vendor_payments rows so totals are not double-counted.
------------------------------------------------------------------------
INSERT INTO division_payments (
  account_id, division_id, mfg_company_id, purchase_invoice_id,
  payment_date, amount, payment_mode, reference_number, notes,
  created_by_user_id, created_at, updated_at
)
SELECT
  vp.account_id,
  pi.division_id,
  d.mfg_company_id,
  vp.purchase_invoice_id,
  vp.payment_date,
  vp.amount,
  vp.payment_mode,
  vp.reference_number,
  vp.notes,
  vp.created_by_user_id,
  vp.created_at,
  now()
FROM vendor_payments vp
INNER JOIN purchase_invoices pi ON pi.id = vp.purchase_invoice_id AND pi.account_id = vp.account_id AND pi.deleted_at IS NULL
INNER JOIN divisions d ON d.id = pi.division_id AND d.account_id = pi.account_id AND d.deleted_at IS NULL
WHERE pi.division_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM division_payments dp
    WHERE dp.account_id = vp.account_id
      AND dp.purchase_invoice_id = vp.purchase_invoice_id
      AND dp.payment_date = vp.payment_date
      AND dp.amount = vp.amount
      AND COALESCE(dp.reference_number, '') = COALESCE(vp.reference_number, '')
  );

DELETE FROM vendor_payments vp
USING purchase_invoices pi
WHERE vp.purchase_invoice_id = pi.id
  AND vp.account_id = pi.account_id
  AND pi.division_id IS NOT NULL;

------------------------------------------------------------------------
-- 5) Recompute purchase invoice payment totals (vendor + division payments)
------------------------------------------------------------------------
UPDATE purchase_invoices pi
SET
  amount_paid = COALESCE(pay.paid, 0)::numeric(14, 2),
  balance_due = GREATEST(0, (pi.total_amount - COALESCE(pay.paid, 0))::numeric(14, 2)),
  payment_status =
    CASE
      WHEN pi.total_amount - COALESCE(pay.paid, 0) <= 0 THEN 'PAID'::invoice_payment_status
      WHEN COALESCE(pay.paid, 0) > 0 THEN 'PARTIAL'::invoice_payment_status
      ELSE 'UNPAID'::invoice_payment_status
    END,
  updated_at = now()
FROM (
  SELECT purchase_invoice_id AS iid, account_id AS acc_id, SUM(amount)::numeric(14, 2) AS paid
  FROM (
    SELECT purchase_invoice_id, account_id, amount FROM vendor_payments
    UNION ALL
    SELECT purchase_invoice_id, account_id, amount FROM division_payments
  ) z
  GROUP BY purchase_invoice_id, account_id
) pay
WHERE pi.id = pay.iid AND pi.account_id = pay.acc_id AND pi.deleted_at IS NULL;
