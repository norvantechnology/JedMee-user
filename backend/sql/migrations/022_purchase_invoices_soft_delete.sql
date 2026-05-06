-- Soft-delete purchase invoices (hidden from UI; data retained).

ALTER TABLE purchase_invoices
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL;

-- Allow reusing invoice numbers after soft-delete; keep uniqueness among non-deleted rows only.
DROP INDEX IF EXISTS purchase_invoices_account_invoice_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS purchase_invoices_account_invoice_number_key
  ON purchase_invoices (account_id, lower(invoice_number))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_invoices_deleted_at ON purchase_invoices (account_id, deleted_at)
  WHERE deleted_at IS NOT NULL;
