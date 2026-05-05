-- Retailer accounting hardening:
-- - allow vendor advances without linked invoice
-- - allow freehand purchase return rows without linked purchase invoice item
-- - add explicit allocation type for vendor payment accounting

ALTER TABLE vendor_payments
  ALTER COLUMN purchase_invoice_id DROP NOT NULL;

ALTER TABLE vendor_payments
  ADD COLUMN IF NOT EXISTS allocation_type TEXT NOT NULL DEFAULT 'INVOICE'
    CHECK (allocation_type IN ('INVOICE', 'ON_ACCOUNT'));

ALTER TABLE purchase_return_items
  ALTER COLUMN purchase_invoice_item_id DROP NOT NULL;
