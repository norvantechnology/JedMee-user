-- Step 3: API cache + quota tracking + SERP storage

CREATE TABLE IF NOT EXISTS api_cache (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    api             TEXT NOT NULL,
    cache_key       TEXT NOT NULL,
    response_json   TEXT NOT NULL,
    cached_at       TEXT NOT NULL,
    UNIQUE(api, cache_key)
);

CREATE TABLE IF NOT EXISTS quota_usage (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    api             TEXT NOT NULL,
    period          TEXT NOT NULL,
    period_key      TEXT NOT NULL,
    count           INTEGER NOT NULL DEFAULT 0,
    UNIQUE(api, period, period_key)
);

CREATE TABLE IF NOT EXISTS serp_snapshots (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id          TEXT NOT NULL,
    query           TEXT NOT NULL,
    location        TEXT,
    captured_at     TEXT NOT NULL,
    cached          INTEGER DEFAULT 0,
    source          TEXT,
    jedmee_position INTEGER,
    results_json    TEXT,
    FOREIGN KEY (run_id) REFERENCES runs(run_id)
);

CREATE INDEX IF NOT EXISTS idx_api_cache_lookup ON api_cache(api, cache_key);
CREATE INDEX IF NOT EXISTS idx_serp_run_id ON serp_snapshots(run_id);
