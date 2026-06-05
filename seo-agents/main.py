#!/usr/bin/env python3
"""JedMee SEO agents — CLI entry point."""
from __future__ import annotations

import argparse
import sys
import uuid
from pathlib import Path

# Ensure package root is on sys.path when run as script
sys.path.insert(0, str(Path(__file__).resolve().parent))

import config
from collectors.data_collector import collect
from tools import db


def cmd_collect(args: argparse.Namespace) -> int:
    run_id = args.run_id or str(uuid.uuid4())
    db.init_db()
    db.create_run(run_id, trigger=args.trigger, goal=args.goal)

    print(f"Starting collect run: {run_id}")
    print(f"Target site: {config.SITE_URL}")
    print(f"Public paths: {', '.join(config.PUBLIC_PATHS)}")

    try:
        ctx = collect(run_id)
        db.complete_run(run_id, status="completed")

        missing_titles = [p for p in ctx["pages"] if not p.get("raw_title")]
        if missing_titles:
            print("\n⚠ WARNING: Some pages have no <title> in raw HTML (SPA risk).")
            print("  Deploy prerender (frontend npm run build) before relying on SEO agents.")
            for p in missing_titles:
                print(f"    - {p['path']}")
        else:
            print("\n✓ All public pages have raw HTML <title> tags.")

        print(f"\nDone. Output: outputs/{run_id}/run_context.json")
        return 0
    except Exception as exc:
        db.complete_run(run_id, status="failed")
        print(f"\nCollect failed: {exc}", file=sys.stderr)
        return 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="JedMee SEO multi-agent system",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_collect = sub.add_parser("collect", help="Run DataCollector (Phase 0: Step 1 HTTP crawl)")
    p_collect.add_argument("--run-id", help="Optional run UUID")
    p_collect.add_argument("--trigger", default="manual", choices=["manual", "scheduled", "ci"])
    p_collect.add_argument("--goal", default="DataCollector — raw HTTP crawl")
    p_collect.set_defaults(func=cmd_collect)

    for name in ("run", "review", "approve", "apply", "reject"):
        sub.add_parser(name, help=f"{name} — not implemented yet (see implementation plan)")

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if not hasattr(args, "func"):
        print(
            f"Command '{args.command}' is not implemented yet.\n"
            "Available now: python main.py collect\n"
            "See docs/SEO_AGENTS_IMPLEMENTATION_PLAN.md"
        )
        return 1

    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
