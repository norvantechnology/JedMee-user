-- JedMee SEO agents — core schema (Phase 0)

CREATE TABLE IF NOT EXISTS runs (
    run_id          TEXT PRIMARY KEY,
    started_at      TEXT NOT NULL,
    completed_at    TEXT,
    trigger         TEXT NOT NULL DEFAULT 'manual',
    goal            TEXT,
    status          TEXT NOT NULL DEFAULT 'running'
);

CREATE TABLE IF NOT EXISTS page_snapshots (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id          TEXT NOT NULL REFERENCES runs(run_id),
    url             TEXT NOT NULL,
    path            TEXT NOT NULL,
    captured_at     TEXT NOT NULL,
    http_status     INTEGER,
    response_time_ms INTEGER,
    raw_html        TEXT,
    raw_title       TEXT,
    raw_meta_desc   TEXT,
    raw_schema_ld_json TEXT,
    canonical_url   TEXT,
    has_noindex     INTEGER DEFAULT 0,
    FOREIGN KEY (run_id) REFERENCES runs(run_id)
);

CREATE INDEX IF NOT EXISTS idx_page_snapshots_run_id ON page_snapshots(run_id);
