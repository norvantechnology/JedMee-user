-- AI visibility probes (Gemini free tier only — other platforms need paid keys)

CREATE TABLE IF NOT EXISTS ai_visibility_snapshots (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id              TEXT NOT NULL,
    captured_at         TEXT NOT NULL,
    platform            TEXT NOT NULL,
    prompt              TEXT NOT NULL,
    jedmee_mentioned    INTEGER DEFAULT 0,
    competitors_mentioned TEXT,
    mention_context     TEXT,
    response_snippet    TEXT
);

CREATE INDEX IF NOT EXISTS idx_ai_visibility_run ON ai_visibility_snapshots(run_id);
