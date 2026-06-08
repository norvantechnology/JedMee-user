-- Agent outputs: task graph, recommendations, approvals

CREATE TABLE IF NOT EXISTS sprints (
    run_id          TEXT PRIMARY KEY,
    goal            TEXT,
    task_graph_json TEXT NOT NULL,
    created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pending_recommendations (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id              TEXT NOT NULL,
    recommendation_id   TEXT NOT NULL,
    type                TEXT NOT NULL,
    page                TEXT,
    category            TEXT,
    file_path           TEXT,
    field               TEXT,
    old_value           TEXT,
    new_value           TEXT,
    proposed_content    TEXT,
    rationale           TEXT,
    priority_score      REAL,
    approval_status     TEXT NOT NULL DEFAULT 'PENDING',
    rejection_reason    TEXT,
    created_at          TEXT NOT NULL,
    UNIQUE(run_id, recommendation_id)
);

CREATE TABLE IF NOT EXISTS agent_outputs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id          TEXT NOT NULL,
    agent           TEXT NOT NULL,
    output_json     TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    UNIQUE(run_id, agent)
);

CREATE INDEX IF NOT EXISTS idx_pending_run ON pending_recommendations(run_id);
CREATE INDEX IF NOT EXISTS idx_pending_status ON pending_recommendations(approval_status);

CREATE TABLE IF NOT EXISTS gsc_baselines (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id          TEXT NOT NULL,
    impressions     INTEGER NOT NULL DEFAULT 0,
    clicks          INTEGER NOT NULL DEFAULT 0,
    captured_at     TEXT NOT NULL
);
