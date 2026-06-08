#!/usr/bin/env python3
"""Post SEO run summary to Slack (optional — needs SLACK_WEBHOOK_URL)."""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import config


def _latest_run_dir() -> Path | None:
    out = config.OUTPUTS_DIR
    if not out.exists():
        return None
    dirs = sorted([d for d in out.iterdir() if d.is_dir()], key=lambda p: p.stat().st_mtime, reverse=True)
    return dirs[0] if dirs else None


def _build_message(run_dir: Path) -> str:
    run_id = run_dir.name
    exec_path = run_dir / "executive_summary.json"
    health = "unknown"
    pending = 0
    if exec_path.exists():
        data = json.loads(exec_path.read_text(encoding="utf-8"))
        health = data.get("health_status", health)
        pending = data.get("recommendations_pending_review", 0)

    return (
        f"*SEO Weekly Audit complete*\n"
        f"Run: `{run_id[:8]}...`\n"
        f"Health: *{health}*\n"
        f"Pending recommendations: {pending}\n"
        f"Review: `python main.py review --run-id {run_id}`"
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", help="Specific run ID (default: latest output folder)")
    parser.add_argument("--latest", action="store_true", help="Use latest outputs folder")
    args = parser.parse_args()

    webhook = os.getenv("SLACK_WEBHOOK_URL", "")
    if not webhook:
        print("SKIP: SLACK_WEBHOOK_URL not set")
        return 0

    if args.run_id:
        run_dir = config.OUTPUTS_DIR / args.run_id
    else:
        run_dir = _latest_run_dir()

    if not run_dir or not run_dir.exists():
        print("FAIL: no run output found")
        return 1

    text = _build_message(run_dir)
    resp = requests.post(webhook, json={"text": text}, timeout=15)
    if resp.status_code >= 400:
        print(f"FAIL: Slack returned {resp.status_code}")
        return 1
    print("OK: Slack notification sent")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
