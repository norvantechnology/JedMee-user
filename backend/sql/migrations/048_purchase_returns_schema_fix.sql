-- Migration 048: Fix purchase_returns schema — add columns missing from migration 020
--
-- Context: migration 047 (backend/migrations/047_purchase_returns_gst_alerts.sql) was
-- placed outside the sql/migrations runner directory and was never applied.  The
-- purchase_returns table therefore still has the schema from migration 020, which is
-- missing several columns that the current handlers depend on.
--
-- All statements are idempotent (ADD COLUMN IF NOT EXISTS / DO blocks).

-- ── 1. deleted_at ─────────────────────────────────────────────────────────────
-- Used by list.js:  WHERE pr.deleted_at IS NULL
ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- ── 2. Division-based return support ─────────────────────────────────────────
-- create.js inserts division_id, division_name, purchase_source for returns
-- that originate from a division invoice rather than a direct vendor invoice.
ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS division_id   UUID;
ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS division_name TEXT;
ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS purchase_source TEXT NOT NULL DEFAULT 'VENDOR';

-- ── 3. Make vendor_id nullable ────────────────────────────────────────────────
-- Division-based returns have no vendor_id; the original schema had it NOT NULL.
DO $$ BEGIN
  ALTER TABLE purchase_returns ALTER COLUMN vendor_id DROP NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;

-- ── 4. Relax return_reason to plain TEXT ──────────────────────────────────────
-- The handler accepts any string (not just the original enum values), so convert
-- the column from the purchase_return_reason enum to TEXT.
DO $$ BEGIN
  ALTER TABLE purchase_returns
    ALTER COLUMN return_reason TYPE TEXT USING return_reason::TEXT;
EXCEPTION WHEN others THEN NULL; END $$;

-- ── 5. Make batch_id nullable in purchase_return_items ────────────────────────
-- Some invoice items may have a NULL batch_id; the original schema had NOT NULL.
DO $$ BEGIN
  ALTER TABLE purchase_return_items ALTER COLUMN batch_id DROP NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;

-- ── 6. Ensure indexes exist ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_purchase_returns_account_id
  ON purchase_returns(account_id);

CREATE INDEX IF NOT EXISTS idx_purchase_returns_status
  ON purchase_returns(status);

CREATE INDEX IF NOT EXISTS idx_purchase_return_items_return_id
  ON purchase_return_items(purchase_return_id);