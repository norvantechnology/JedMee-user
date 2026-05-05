-- Track CSV/API vs manual entry (optional lineage to import_jobs)
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS import_source text NOT NULL DEFAULT 'MANUAL'
    CHECK (import_source IN ('MANUAL', 'CSV_IMPORT', 'API'));

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS import_job_id uuid REFERENCES import_jobs(id) ON DELETE SET NULL;

ALTER TABLE product_batches
  ADD COLUMN IF NOT EXISTS import_source text NOT NULL DEFAULT 'MANUAL'
    CHECK (import_source IN ('MANUAL', 'CSV_IMPORT', 'API'));

ALTER TABLE product_batches
  ADD COLUMN IF NOT EXISTS import_job_id uuid REFERENCES import_jobs(id) ON DELETE SET NULL;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS import_source text NOT NULL DEFAULT 'MANUAL'
    CHECK (import_source IN ('MANUAL', 'CSV_IMPORT', 'API'));

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS import_job_id uuid REFERENCES import_jobs(id) ON DELETE SET NULL;

ALTER TABLE mfg_companies
  ADD COLUMN IF NOT EXISTS import_source text NOT NULL DEFAULT 'MANUAL'
    CHECK (import_source IN ('MANUAL', 'CSV_IMPORT', 'API'));

ALTER TABLE mfg_companies
  ADD COLUMN IF NOT EXISTS import_job_id uuid REFERENCES import_jobs(id) ON DELETE SET NULL;

ALTER TABLE divisions
  ADD COLUMN IF NOT EXISTS import_source text NOT NULL DEFAULT 'MANUAL'
    CHECK (import_source IN ('MANUAL', 'CSV_IMPORT', 'API'));

ALTER TABLE divisions
  ADD COLUMN IF NOT EXISTS import_job_id uuid REFERENCES import_jobs(id) ON DELETE SET NULL;

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS import_source text NOT NULL DEFAULT 'MANUAL'
    CHECK (import_source IN ('MANUAL', 'CSV_IMPORT', 'API'));

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS import_job_id uuid REFERENCES import_jobs(id) ON DELETE SET NULL;

ALTER TABLE inventory_txns
  ADD COLUMN IF NOT EXISTS import_job_id uuid REFERENCES import_jobs(id) ON DELETE SET NULL;
