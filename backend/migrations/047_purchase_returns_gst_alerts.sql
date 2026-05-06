-- Migration 047: Purchase returns tables, reorder_level, GST fields on sales invoice items
-- Idempotent: all changes use IF NOT EXISTS / DO blocks

-- ── purchase_returns ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_returns (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            UUID NOT NULL,
  return_number         TEXT NOT NULL,
  purchase_invoice_id   UUID NOT NULL,
  vendor_id             UUID,
  division_id           UUID,
  division_name         TEXT,
  purchase_source       TEXT NOT NULL DEFAULT 'VENDOR',
  return_date           DATE NOT NULL,
  return_reason         TEXT NOT NULL DEFAULT 'OTHER',
  status                TEXT NOT NULL DEFAULT 'DRAFT',
  credit_note_number    TEXT,
  notes                 TEXT,
  total_amount          NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_by_user_id    UUID,
  confirmed_at          TIMESTAMPTZ,
  confirmed_by_user_id  UUID,
  deleted_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, return_number)
);

CREATE TABLE IF NOT EXISTS purchase_return_items (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id                UUID NOT NULL,
  purchase_return_id        UUID NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
  purchase_invoice_item_id  UUID NOT NULL,
  batch_id                  UUID,
  return_qty                NUMERIC(14,4) NOT NULL DEFAULT 0,
  return_free_qty           NUMERIC(14,4) NOT NULL DEFAULT 0,
  return_amount             NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes                     TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_purchase_returns_account_id     ON purchase_returns(account_id);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_invoice_id     ON purchase_returns(purchase_invoice_id);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_status         ON purchase_returns(status);
CREATE INDEX IF NOT EXISTS idx_purchase_return_items_return_id ON purchase_return_items(purchase_return_id);

-- ── reorder_level on products ─────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'reorder_level'
  ) THEN
    ALTER TABLE products ADD COLUMN reorder_level NUMERIC(14,4) DEFAULT 0;
  END IF;
END $$;

-- ── GST fields on sales_invoice_items ────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales_invoice_items' AND column_name = 'hsn_code'
  ) THEN
    ALTER TABLE sales_invoice_items ADD COLUMN hsn_code TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales_invoice_items' AND column_name = 'taxable_amount'
  ) THEN
    ALTER TABLE sales_invoice_items ADD COLUMN taxable_amount NUMERIC(14,2) DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales_invoice_items' AND column_name = 'cgst_amount'
  ) THEN
    ALTER TABLE sales_invoice_items ADD COLUMN cgst_amount NUMERIC(14,2) DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales_invoice_items' AND column_name = 'sgst_amount'
  ) THEN
    ALTER TABLE sales_invoice_items ADD COLUMN sgst_amount NUMERIC(14,2) DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales_invoice_items' AND column_name = 'igst_amount'
  ) THEN
    ALTER TABLE sales_invoice_items ADD COLUMN igst_amount NUMERIC(14,2) DEFAULT 0;
  END IF;
END $$;

-- GST fields on sales_invoices totals
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales_invoices' AND column_name = 'total_tax'
  ) THEN
    ALTER TABLE sales_invoices ADD COLUMN total_tax NUMERIC(14,2) DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales_invoices' AND column_name = 'taxable_amount'
  ) THEN
    ALTER TABLE sales_invoices ADD COLUMN taxable_amount NUMERIC(14,2) DEFAULT 0;
  END IF;
END $$;

-- HSN code on products
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'hsn_code'
  ) THEN
    ALTER TABLE products ADD COLUMN hsn_code TEXT;
  END IF;
END $$;