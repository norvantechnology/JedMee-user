"""SQLite helpers for SEO run tracking."""
from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import config


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_connection() -> sqlite3.Connection:
    config.DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(config.DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    migration = config.MIGRATIONS_DIR / "001_init.sql"
    sql = migration.read_text(encoding="utf-8")
    with get_connection() as conn:
        conn.executescript(sql)
        conn.commit()


def create_run(run_id: str, trigger: str = "manual", goal: str | None = None) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO runs (run_id, started_at, trigger, goal, status)
            VALUES (?, ?, ?, ?, 'running')
            """,
            (run_id, _utc_now(), trigger, goal),
        )
        conn.commit()


def complete_run(run_id: str, status: str = "completed") -> None:
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE runs SET completed_at = ?, status = ? WHERE run_id = ?
            """,
            (_utc_now(), status, run_id),
        )
        conn.commit()


def save_page_snapshot(run_id: str, snapshot: dict[str, Any]) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO page_snapshots (
                run_id, url, path, captured_at, http_status, response_time_ms,
                raw_html, raw_title, raw_meta_desc, raw_schema_ld_json,
                canonical_url, has_noindex
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                run_id,
                snapshot["url"],
                snapshot["path"],
                snapshot["captured_at"],
                snapshot.get("http_status"),
                snapshot.get("response_time_ms"),
                snapshot.get("raw_html"),
                snapshot.get("raw_title"),
                snapshot.get("raw_meta_desc"),
                snapshot.get("raw_schema_ld_json"),
                snapshot.get("canonical_url"),
                1 if snapshot.get("has_noindex") else 0,
            ),
        )
        conn.commit()
