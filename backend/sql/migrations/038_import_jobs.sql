-- CSV / Excel import job staging (account = app_users.id tenant)
CREATE TABLE IF NOT EXISTS import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  created_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  entity_type text NOT NULL,
  status text NOT NULL DEFAULT 'PARSED'
    CHECK (status IN ('PARSED', 'VALIDATING', 'VALIDATED', 'RUNNING', 'COMPLETED', 'FAILED', 'PARTIAL')),
  original_filename text,
  staging jsonb NOT NULL DEFAULT '{}'::jsonb,
  column_mappings jsonb,
  validation_result jsonb,
  duplicate_strategy text NOT NULL DEFAULT 'UPDATE'
    CHECK (duplicate_strategy IN ('SKIP', 'UPDATE', 'CREATE_NEW')),
  skip_errors boolean NOT NULL DEFAULT false,
  total_rows integer NOT NULL DEFAULT 0,
  processed_rows integer NOT NULL DEFAULT 0,
  created_rows integer NOT NULL DEFAULT 0,
  updated_rows integer NOT NULL DEFAULT 0,
  skipped_rows integer NOT NULL DEFAULT 0,
  error_rows integer NOT NULL DEFAULT 0,
  execute_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_import_jobs_account_created ON import_jobs (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_jobs_account_status ON import_jobs (account_id, status);
