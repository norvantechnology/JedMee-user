"""
DataCollector orchestrator.

Phase 0: Step 1 (raw HTTP) only.
Later phases add Playwright, repo parse, PSI, GSC, SERP, render delta.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import config
from collectors.http_crawler import crawl_all_public_pages
from tools import db


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def collect(run_id: str) -> dict[str, Any]:
    """Run available collector steps and build run_context.json."""
    db.init_db()

    print("\n[DataCollector] Step 1 — Raw HTTP crawl")
    pages = crawl_all_public_pages()

    for page in pages:
        db.save_page_snapshot(run_id, page)

    run_context: dict[str, Any] = {
        "run_id": run_id,
        "generated_at": _utc_now(),
        "site_url": config.SITE_URL,
        "data_quality": "PARTIAL",
        "steps_completed": ["raw_http"],
        "steps_pending": [
            "playwright_render",
            "repo_parse",
            "pagespeed",
            "gsc",
            "serp",
            "render_delta",
        ],
        "pages": [
            {
                "path": p["path"],
                "url": p["url"],
                "http_status": p["http_status"],
                "response_time_ms": p["response_time_ms"],
                "raw_title": p["raw_title"],
                "raw_meta_desc": p["raw_meta_desc"],
                "canonical_url": p["canonical_url"],
                "has_noindex": p["has_noindex"],
                "schema_count": p["schema_count"],
                "spa_risk_score": None,
            }
            for p in pages
        ],
    }

    out_dir = config.OUTPUTS_DIR / run_id
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "run_context.json"
    out_path.write_text(json.dumps(run_context, indent=2), encoding="utf-8")

    print(f"\n[DataCollector] Saved → {out_path}")
    return run_context
