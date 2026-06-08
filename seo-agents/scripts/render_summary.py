#!/usr/bin/env python3
"""Render GitHub Step Summary markdown for a SEO run."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import config
from tools import db


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", required=True)
    args = parser.parse_args()

    db.init_db()
    run_dir = config.OUTPUTS_DIR / args.run_id
    exec_path = run_dir / "executive_summary.json"

    lines = [f"## SEO Run `{args.run_id[:8]}`", ""]

    if exec_path.exists():
        data = json.loads(exec_path.read_text(encoding="utf-8"))
        lines.append(f"**Health:** {data.get('health_status')}")
        lines.append(f"**Pending recommendations:** {data.get('recommendations_pending_review', 0)}")
        lines.append("")
        lines.append("### Top actions")
        for action in data.get("top_3_actions", []):
            lines.append(f"- [{action.get('type')}] {action.get('title')}")

    activity = db.list_agent_activity(run_id=args.run_id)
    errors = [a for a in activity if a.get("status") == "error"]
    lines.append("")
    lines.append(f"**Activity log:** {len(activity)} entries, {len(errors)} errors")

    print("\n".join(lines))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
