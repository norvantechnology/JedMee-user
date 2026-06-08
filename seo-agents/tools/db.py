"""SQLite helpers for SEO run tracking."""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
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
    migrations = sorted(config.MIGRATIONS_DIR.glob("*.sql"))
    with get_connection() as conn:
        for migration in migrations:
            sql = migration.read_text(encoding="utf-8")
            try:
                conn.executescript(sql)
            except sqlite3.OperationalError as exc:
                if "duplicate column name" not in str(exc).lower():
                    raise
        conn.commit()


def create_run(run_id: str, trigger: str = "manual", goal: str | None = None) -> None:
    with get_connection() as conn:
        existing = conn.execute(
            "SELECT 1 FROM runs WHERE run_id = ?", (run_id,)
        ).fetchone()
        if existing:
            conn.execute(
                """
                UPDATE runs
                SET started_at = ?, trigger = ?, goal = ?, status = 'running', completed_at = NULL
                WHERE run_id = ?
                """,
                (_utc_now(), trigger, goal, run_id),
            )
        else:
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


def get_api_cache(api: str, cache_key: str) -> sqlite3.Row | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM api_cache WHERE api = ? AND cache_key = ?",
            (api, cache_key),
        ).fetchone()
        return row


def set_api_cache(api: str, cache_key: str, response_json: str) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO api_cache (api, cache_key, response_json, cached_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(api, cache_key) DO UPDATE SET
                response_json = excluded.response_json,
                cached_at = excluded.cached_at
            """,
            (api, cache_key, response_json, _utc_now()),
        )
        conn.commit()


def get_quota_count(api: str, period: str, period_key: str) -> int:
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT count FROM quota_usage
            WHERE api = ? AND period = ? AND period_key = ?
            """,
            (api, period, period_key),
        ).fetchone()
        return int(row["count"]) if row else 0


def increment_quota(api: str, period: str, period_key: str, count: int = 1) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO quota_usage (api, period, period_key, count)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(api, period, period_key) DO UPDATE SET
                count = count + excluded.count
            """,
            (api, period, period_key, count),
        )
        conn.commit()


def save_serp_snapshot(run_id: str, snapshot: dict[str, Any]) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO serp_snapshots (
                run_id, query, location, captured_at, cached, source,
                jedmee_position, results_json,
                people_also_ask, related_searches, answer_box
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                run_id,
                snapshot["query"],
                snapshot.get("location"),
                snapshot.get("captured_at", _utc_now()),
                1 if snapshot.get("cached") else 0,
                snapshot.get("source"),
                snapshot.get("jedmee_position"),
                json.dumps(snapshot.get("results", [])),
                json.dumps(snapshot.get("people_also_ask", [])),
                json.dumps(snapshot.get("related_searches", [])),
                json.dumps(snapshot.get("answer_box")),
            ),
        )
        conn.commit()


def save_page_snapshot(run_id: str, snapshot: dict[str, Any]) -> None:
    h2s = snapshot.get("h2s")
    h3s = snapshot.get("h3s")
    flags = snapshot.get("spa_risk_flags")

    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO page_snapshots (
                run_id, url, path, captured_at, http_status, response_time_ms,
                raw_html, raw_title, raw_meta_desc, raw_schema_ld_json,
                canonical_url, has_noindex,
                rendered_html, rendered_title, rendered_meta_desc, rendered_schema_ld_json,
                h1, h2s, h3s, raw_word_count, rendered_word_count,
                spa_risk_score, spa_risk_flags
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                snapshot.get("rendered_html"),
                snapshot.get("rendered_title"),
                snapshot.get("rendered_meta_desc"),
                snapshot.get("rendered_schema_ld_json"),
                snapshot.get("h1"),
                json.dumps(h2s) if h2s is not None else None,
                json.dumps(h3s) if h3s is not None else None,
                snapshot.get("raw_word_count"),
                snapshot.get("rendered_word_count"),
                snapshot.get("spa_risk_score"),
                json.dumps(flags) if flags is not None else None,
            ),
        )
        conn.commit()


def save_sprint(run_id: str, goal: str, task_graph_json: str) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO sprints (run_id, goal, task_graph_json, created_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(run_id) DO UPDATE SET
                goal = excluded.goal,
                task_graph_json = excluded.task_graph_json,
                created_at = excluded.created_at
            """,
            (run_id, goal, task_graph_json, _utc_now()),
        )
        conn.commit()


def get_sprint(run_id: str) -> dict[str, Any]:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM sprints WHERE run_id = ?", (run_id,)
        ).fetchone()
        if not row:
            raise KeyError(f"No sprint for run_id {run_id}")
        return dict(row)


def save_agent_output(run_id: str, agent: str, data: dict[str, Any]) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO agent_outputs (run_id, agent, output_json, created_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(run_id, agent) DO UPDATE SET
                output_json = excluded.output_json,
                created_at = excluded.created_at
            """,
            (run_id, agent, json.dumps(data), _utc_now()),
        )
        conn.commit()


def save_recommendation(run_id: str, rec: dict[str, Any]) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO pending_recommendations (
                run_id, recommendation_id, type, page, category,
                file_path, field, old_value, new_value, proposed_content,
                rationale, priority_score, approval_status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)
            ON CONFLICT(run_id, recommendation_id) DO UPDATE SET
                type = excluded.type,
                page = excluded.page,
                category = excluded.category,
                file_path = excluded.file_path,
                field = excluded.field,
                old_value = excluded.old_value,
                new_value = excluded.new_value,
                proposed_content = excluded.proposed_content,
                rationale = excluded.rationale,
                priority_score = excluded.priority_score
            """,
            (
                run_id,
                rec["recommendation_id"],
                rec["type"],
                rec.get("page"),
                rec.get("category"),
                rec.get("file_path"),
                rec.get("field"),
                rec.get("old_value"),
                rec.get("new_value"),
                rec.get("proposed_content"),
                rec.get("rationale"),
                rec.get("priority_score"),
                _utc_now(),
            ),
        )
        conn.commit()


def list_recommendations(run_id: str, status: str | None = None) -> list[dict[str, Any]]:
    with get_connection() as conn:
        if status:
            rows = conn.execute(
                """
                SELECT * FROM pending_recommendations
                WHERE run_id = ? AND approval_status = ?
                ORDER BY priority_score DESC
                """,
                (run_id, status),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT * FROM pending_recommendations
                WHERE run_id = ?
                ORDER BY priority_score DESC
                """,
                (run_id,),
            ).fetchall()
        return [dict(r) for r in rows]


def approve_recommendations(
    run_id: str,
    rec_ids: list[str] | None = None,
    approve_all: bool = False,
) -> int:
    with get_connection() as conn:
        if approve_all:
            cur = conn.execute(
                """
                UPDATE pending_recommendations
                SET approval_status = 'APPROVED'
                WHERE run_id = ? AND approval_status = 'PENDING'
                """,
                (run_id,),
            )
        elif rec_ids:
            placeholders = ",".join("?" * len(rec_ids))
            cur = conn.execute(
                f"""
                UPDATE pending_recommendations
                SET approval_status = 'APPROVED'
                WHERE run_id = ? AND recommendation_id IN ({placeholders})
                  AND approval_status = 'PENDING'
                """,
                (run_id, *rec_ids),
            )
        else:
            return 0
        conn.commit()
        return cur.rowcount


def reject_recommendation(run_id: str, rec_id: str, reason: str) -> bool:
    with get_connection() as conn:
        cur = conn.execute(
            """
            UPDATE pending_recommendations
            SET approval_status = 'REJECTED', rejection_reason = ?
            WHERE run_id = ? AND recommendation_id = ?
            """,
            (reason, run_id, rec_id),
        )
        conn.commit()
        return cur.rowcount > 0


def get_approved_onpage_recommendations(run_id: str) -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT * FROM pending_recommendations
            WHERE run_id = ? AND approval_status = 'APPROVED' AND type = 'ONPAGE'
            ORDER BY priority_score DESC
            """,
            (run_id,),
        ).fetchall()
        return [dict(r) for r in rows]


def save_gsc_baseline(run_id: str, impressions: int, clicks: int) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO gsc_baselines (run_id, impressions, clicks, captured_at)
            VALUES (?, ?, ?, ?)
            """,
            (run_id, impressions, clicks, _utc_now()),
        )
        conn.commit()


def get_prior_gsc_totals(limit: int = 1) -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT impressions, clicks, run_id, captured_at
            FROM gsc_baselines
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit + 1,),
        ).fetchall()
        if len(rows) < 2:
            return []
        return [dict(rows[1])]


def log_agent_activity(
    run_id: str,
    agent: str,
    task: str,
    status: str = "ok",
    detail: str | None = None,
    error_message: str | None = None,
) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO agent_activity (
                run_id, agent, task, status, detail, error_message, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (run_id, agent, task, status, detail, error_message, _utc_now()),
        )
        conn.commit()


def list_agent_activity(
    run_id: str | None = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    with get_connection() as conn:
        if run_id:
            rows = conn.execute(
                """
                SELECT * FROM agent_activity
                WHERE run_id = ?
                ORDER BY id ASC
                """,
                (run_id,),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT * FROM agent_activity
                ORDER BY id DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
        return [dict(r) for r in rows]


def list_tables() -> list[str]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        ).fetchall()
        return [r["name"] for r in rows]


def save_human_feedback(
    run_id: str,
    recommendation_id: str,
    *,
    approved: bool | None = None,
    quality_score: int | None = None,
    rejection_reason: str | None = None,
    rated_by: str | None = None,
    agent_type: str | None = None,
) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO human_feedback (
                run_id, recommendation_id, approved, quality_score,
                rejection_reason, rated_by, rated_at, agent_type
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(run_id, recommendation_id) DO UPDATE SET
                approved = COALESCE(excluded.approved, human_feedback.approved),
                quality_score = COALESCE(excluded.quality_score, human_feedback.quality_score),
                rejection_reason = COALESCE(excluded.rejection_reason, human_feedback.rejection_reason),
                rated_by = COALESCE(excluded.rated_by, human_feedback.rated_by),
                rated_at = excluded.rated_at,
                agent_type = COALESCE(excluded.agent_type, human_feedback.agent_type)
            """,
            (
                run_id,
                recommendation_id,
                None if approved is None else (1 if approved else 0),
                quality_score,
                rejection_reason,
                rated_by,
                _utc_now(),
                agent_type,
            ),
        )
        conn.commit()


def get_approved_content_recommendations(run_id: str) -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT * FROM pending_recommendations
            WHERE run_id = ? AND type = 'CONTENT' AND approval_status = 'APPROVED'
            """,
            (run_id,),
        ).fetchall()
        return [dict(r) for r in rows]


def save_ai_visibility_probe(run_id: str, probe: dict[str, Any]) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO ai_visibility_snapshots (
                run_id, captured_at, platform, prompt, jedmee_mentioned,
                competitors_mentioned, mention_context, response_snippet
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                run_id,
                probe.get("captured_at", _utc_now()),
                probe["platform"],
                probe["prompt"],
                1 if probe.get("jedmee_mentioned") else 0,
                json.dumps(probe.get("competitors_mentioned", [])),
                probe.get("mention_context"),
                (probe.get("response_snippet") or "")[:8000],
            ),
        )
        conn.commit()


def compute_agent_accuracy(week_start: str | None = None) -> list[dict[str, Any]]:
    """Roll up human_feedback into agent_accuracy_scores for the week."""
    if not week_start:
        from datetime import date, timedelta
        today = date.today()
        week_start = (today - timedelta(days=today.weekday())).isoformat()

    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT agent_type,
                   COUNT(*) as total,
                   SUM(CASE WHEN approved = 1 THEN 1 ELSE 0 END) as approved_count,
                   SUM(CASE WHEN approved = 0 THEN 1 ELSE 0 END) as rejected_count,
                   AVG(quality_score) as avg_quality
            FROM human_feedback
            WHERE rated_at >= ? AND agent_type IS NOT NULL
            GROUP BY agent_type
            """,
            (week_start,),
        ).fetchall()

        results: list[dict[str, Any]] = []
        for row in rows:
            total = row["total"] or 0
            approved = row["approved_count"] or 0
            rejected = row["rejected_count"] or 0
            decided = approved + rejected
            rate = approved / decided if decided else None
            conn.execute(
                """
                INSERT INTO agent_accuracy_scores (
                    week_start, agent_type, total_recommendations,
                    approved_count, rejected_count, avg_quality_score,
                    approval_rate, computed_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(week_start, agent_type) DO UPDATE SET
                    total_recommendations = excluded.total_recommendations,
                    approved_count = excluded.approved_count,
                    rejected_count = excluded.rejected_count,
                    avg_quality_score = excluded.avg_quality_score,
                    approval_rate = excluded.approval_rate,
                    computed_at = excluded.computed_at
                """,
                (
                    week_start,
                    row["agent_type"],
                    total,
                    approved,
                    rejected,
                    row["avg_quality"],
                    rate,
                    _utc_now(),
                ),
            )
            results.append(dict(row))
        conn.commit()
        return results
