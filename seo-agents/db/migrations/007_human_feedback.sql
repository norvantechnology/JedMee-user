-- Human trust & feedback loop (Part L)

CREATE TABLE IF NOT EXISTS human_feedback (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id              TEXT NOT NULL,
    recommendation_id   TEXT NOT NULL,
    approved            INTEGER,
    quality_score       INTEGER,
    rejection_reason    TEXT,
    rated_by            TEXT,
    rated_at            TEXT NOT NULL,
    agent_type          TEXT,
    UNIQUE(run_id, recommendation_id)
);

CREATE TABLE IF NOT EXISTS agent_accuracy_scores (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    week_start              TEXT NOT NULL,
    agent_type                TEXT NOT NULL,
    total_recommendations   INTEGER DEFAULT 0,
    approved_count          INTEGER DEFAULT 0,
    rejected_count          INTEGER DEFAULT 0,
    avg_quality_score       REAL,
    approval_rate           REAL,
    top_rejection_reasons   TEXT,
    computed_at             TEXT NOT NULL,
    UNIQUE(week_start, agent_type)
);

CREATE INDEX IF NOT EXISTS idx_human_feedback_run ON human_feedback(run_id);
CREATE INDEX IF NOT EXISTS idx_accuracy_week ON agent_accuracy_scores(week_start);
