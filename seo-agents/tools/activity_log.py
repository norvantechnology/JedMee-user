"""Log and query agent task activity per run."""
from __future__ import annotations

from typing import Any

from tools import db


def log(
    run_id: str,
    agent: str,
    task: str,
    status: str = "ok",
    detail: str | None = None,
    error: str | None = None,
) -> None:
    db.log_agent_activity(
        run_id=run_id,
        agent=agent,
        task=task,
        status=status,
        detail=detail,
        error_message=error,
    )


def log_ok(run_id: str, agent: str, task: str, detail: str | None = None) -> None:
    log(run_id, agent, task, "ok", detail=detail)


def log_error(run_id: str, agent: str, task: str, error: Exception | str) -> None:
    msg = str(error)
    log(run_id, agent, task, "error", error=msg)


def log_skip(run_id: str, agent: str, task: str, detail: str | None = None) -> None:
    log(run_id, agent, task, "skipped", detail=detail)


def log_warn(run_id: str, agent: str, task: str, detail: str | None = None) -> None:
    log(run_id, agent, task, "warning", detail=detail)
