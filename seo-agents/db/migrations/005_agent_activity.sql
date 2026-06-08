-- Agent activity log: what each agent did, when, and any errors

CREATE TABLE IF NOT EXISTS agent_activity (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id          TEXT NOT NULL,
    agent           TEXT NOT NULL,
    task            TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'ok',
    detail          TEXT,
    error_message   TEXT,
    created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_activity_run_id ON agent_activity(run_id);
CREATE INDEX IF NOT EXISTS idx_agent_activity_created ON agent_activity(created_at);
CREATE INDEX IF NOT EXISTS idx_agent_activity_agent ON agent_activity(agent);
