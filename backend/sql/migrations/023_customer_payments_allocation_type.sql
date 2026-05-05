-- Classify customer payments as invoice-linked vs on-account advances.
ALTER TABLE customer_payments
  ADD COLUMN IF NOT EXISTS allocation_type text;

UPDATE customer_payments
SET allocation_type = CASE WHEN sales_invoice_id IS NULL THEN 'ON_ACCOUNT' ELSE 'INVOICE' END
WHERE allocation_type IS NULL;

ALTER TABLE customer_payments
  ALTER COLUMN allocation_type SET DEFAULT 'INVOICE';

ALTER TABLE customer_payments
  ALTER COLUMN allocation_type SET NOT NULL;

ALTER TABLE customer_payments
  DROP CONSTRAINT IF EXISTS customer_payments_allocation_type_chk;

ALTER TABLE customer_payments
  ADD CONSTRAINT customer_payments_allocation_type_chk
  CHECK (allocation_type IN ('INVOICE', 'ON_ACCOUNT'));

CREATE INDEX IF NOT EXISTS idx_customer_payments_allocation_type
  ON customer_payments(allocation_type);
