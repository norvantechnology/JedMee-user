-- Step 2: rendered crawl + SPA risk columns

ALTER TABLE page_snapshots ADD COLUMN rendered_html TEXT;
ALTER TABLE page_snapshots ADD COLUMN rendered_title TEXT;
ALTER TABLE page_snapshots ADD COLUMN rendered_meta_desc TEXT;
ALTER TABLE page_snapshots ADD COLUMN rendered_schema_ld_json TEXT;
ALTER TABLE page_snapshots ADD COLUMN h1 TEXT;
ALTER TABLE page_snapshots ADD COLUMN h2s TEXT;
ALTER TABLE page_snapshots ADD COLUMN h3s TEXT;
ALTER TABLE page_snapshots ADD COLUMN raw_word_count INTEGER;
ALTER TABLE page_snapshots ADD COLUMN rendered_word_count INTEGER;
ALTER TABLE page_snapshots ADD COLUMN spa_risk_score REAL;
ALTER TABLE page_snapshots ADD COLUMN spa_risk_flags TEXT;
