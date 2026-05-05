-- 010_indexes.sql
-- Performance indexes (multi-tenant + search)

-- Tenant listing indexes
CREATE INDEX IF NOT EXISTS app_users_account_created_at_idx ON app_users (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS app_users_account_status_idx ON app_users (account_id, status);
CREATE INDEX IF NOT EXISTS app_users_role_id_idx ON app_users (role_id);

-- Unique identifiers (allow NULLs without global uniqueness collisions)
CREATE UNIQUE INDEX IF NOT EXISTS app_users_gst_number_key ON app_users (gst_number) WHERE gst_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS app_users_dl1_number_key ON app_users (drug_license_1_number) WHERE drug_license_1_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS app_users_dl2_number_key ON app_users (drug_license_2_number) WHERE drug_license_2_number IS NOT NULL;

-- Optional trigram indexes for "contains" search (safe even if not used yet)
CREATE INDEX IF NOT EXISTS app_users_full_name_trgm_idx ON app_users USING gin (full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS app_users_email_trgm_idx ON app_users USING gin (email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS vendors_name_trgm_idx ON vendors USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS vendors_code_trgm_idx ON vendors USING gin (code gin_trgm_ops);

-- Product batch (quality master) indexes
CREATE INDEX IF NOT EXISTS product_batches_account_created_at_idx ON product_batches (account_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS product_batches_account_expiry_idx ON product_batches (account_id, expiry_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS product_batches_product_name_trgm_idx ON product_batches USING gin (product_name gin_trgm_ops) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS product_batches_batch_no_trgm_idx ON product_batches USING gin (batch_no gin_trgm_ops) WHERE deleted_at IS NULL;

