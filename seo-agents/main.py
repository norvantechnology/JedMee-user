#!/usr/bin/env python3
"""JedMee SEO agents — CLI entry point."""
from __future__ import annotations

import argparse
import subprocess
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import config
from agents.orchestrator import run_full_cycle
from collectors.data_collector import collect
from tools import db
from tools import activity_log
from tools.apply_patches import apply_all_approved, apply_approved_onpage
from tools.gsc_indexing import notify_indexing_updated_pages


def cmd_collect(args: argparse.Namespace) -> int:
    run_id = args.run_id or str(uuid.uuid4())
    db.init_db()
    db.create_run(run_id, trigger=args.trigger, goal=args.goal)

    print(f"Starting collect run: {run_id}")
    print(f"Target site: {config.SITE_URL}")

    try:
        collect(run_id, skip_playwright=args.skip_playwright)
        db.complete_run(run_id, status="completed")
        print(f"\nDone. Output: outputs/{run_id}/run_context.json")
        return 0
    except Exception as exc:
        activity_log.log_error(run_id, "system", "collect", exc)
        db.complete_run(run_id, status="failed")
        print(f"\nCollect failed: {exc}", file=sys.stderr)
        return 1


def cmd_run(args: argparse.Namespace) -> int:
    run_id = args.run_id or str(uuid.uuid4())
    db.init_db()
    db.create_run(run_id, trigger=args.trigger, goal=args.goal)

    print(f"Starting full SEO run: {run_id}")
    print(f"Goal: {args.goal}")

    try:
        run_full_cycle(
            run_id,
            goal=args.goal,
            skip_playwright=args.skip_playwright,
            skip_collect=args.skip_collect,
        )
        db.complete_run(run_id, status="completed")
        print(f"\nRun complete. Output: outputs/{run_id}/")
        return 0
    except Exception as exc:
        db.complete_run(run_id, status="failed")
        print(f"\nRun failed: {exc}", file=sys.stderr)
        return 1


def cmd_deploy(args: argparse.Namespace) -> int:
    """
    Production pipeline: audit live site → auto-approve ONPAGE meta → apply patches
    → optional git push → notify GSC sitemap.
    """
    run_id = args.run_id or str(uuid.uuid4())
    db.init_db()
    db.create_run(run_id, trigger=args.trigger, goal=args.goal)

    print(f"SEO deploy pipeline: {run_id}")
    print(f"Target: {config.SITE_URL}")

    try:
        run_full_cycle(
            run_id,
            goal=args.goal,
            skip_playwright=args.skip_playwright,
            skip_collect=args.skip_collect,
        )

        pending = db.list_recommendations(run_id, status="PENDING")
        onpage_ids = [
            r["recommendation_id"]
            for r in pending
            if r["type"] == "ONPAGE" and r.get("file_path") and r.get("field")
        ]
        if onpage_ids:
            approved = db.approve_recommendations(run_id, rec_ids=onpage_ids)
            print(f"\n[Deploy] Auto-approved {approved} ONPAGE recommendation(s)")
            activity_log.log_ok(
                run_id, "Deploy", "auto_approve",
                detail=f"{approved} ONPAGE recommendation(s)",
            )
        else:
            print("\n[Deploy] No ONPAGE meta patches to apply")
            activity_log.log_skip(run_id, "Deploy", "auto_approve", detail="no ONPAGE patches")

        applied_ids = apply_approved_onpage(run_id)
        for rec_id in applied_ids:
            print(f"  ✓ applied {rec_id}")
        if applied_ids:
            activity_log.log_ok(
                run_id, "Deploy", "apply_patches",
                detail=f"applied: {', '.join(applied_ids)}",
            )
        else:
            activity_log.log_skip(run_id, "Deploy", "apply_patches")

        if args.notify_gsc:
            print("\n[Deploy] Notifying Google Search Console (sitemap resubmit)...")
            try:
                gsc_result = notify_indexing_updated_pages()
                print(f"  GSC API: {gsc_result.get('gsc_api')}")
                print(f"  Google ping: {gsc_result.get('google_ping')}")
                activity_log.log_ok(
                    run_id, "Deploy", "notify_gsc",
                    detail=f"gsc_api={gsc_result.get('gsc_api')}",
                )
            except Exception as exc:
                activity_log.log_error(run_id, "Deploy", "notify_gsc", exc)
                raise

        if args.push and applied_ids:
            try:
                _git_commit_push(run_id, len(applied_ids))
                activity_log.log_ok(run_id, "Deploy", "git_push")
            except Exception as exc:
                activity_log.log_error(run_id, "Deploy", "git_push", exc)
                raise

        db.complete_run(run_id, status="completed")
        activity_log.log_ok(run_id, "Deploy", "pipeline_complete")
        print(f"\nDeploy pipeline complete. Run: outputs/{run_id}/")
        return 0
    except Exception as exc:
        activity_log.log_error(run_id, "system", "deploy", exc)
        db.complete_run(run_id, status="failed")
        print(f"\nDeploy pipeline failed: {exc}", file=sys.stderr)
        return 1


def _git_commit_push(run_id: str, applied_count: int) -> None:
    repo = config.REPO_ROOT
    subprocess.run(["git", "add", "frontend/src/pages/"], cwd=repo, check=False)
    diff = subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=repo)
    if diff.returncode == 0:
        print("[Deploy] No git changes to commit")
        return
    msg = f"seo: auto-apply {applied_count} ONPAGE patch(es) [seo-auto] run {run_id[:8]}"
    subprocess.run(["git", "commit", "-m", msg], cwd=repo, check=True)
    subprocess.run(["git", "push"], cwd=repo, check=True)
    print(f"[Deploy] Committed and pushed: {msg}")


def cmd_review(args: argparse.Namespace) -> int:
    db.init_db()
    recs = db.list_recommendations(args.run_id, status=args.status)
    if not recs:
        print(f"No recommendations found for run {args.run_id}")
        return 0

    print(f"\nRecommendations for run {args.run_id} ({len(recs)}):\n")
    for rec in recs:
        print(f"  [{rec['approval_status']}] {rec['recommendation_id']} ({rec['type']}/{rec.get('category')})")
        print(f"    page: {rec.get('page')}  score: {rec.get('priority_score')}")
        if rec.get("file_path"):
            print(f"    file: {rec['file_path']}  field: {rec.get('field')}")
            print(f"    old: {(rec.get('old_value') or '')[:80]}")
            print(f"    new: {(rec.get('new_value') or '')[:80]}")
        elif rec.get("proposed_content"):
            print(f"    content: {rec['proposed_content'][:120]}...")
        if rec.get("rationale"):
            print(f"    why: {rec['rationale'][:120]}")
        if rec.get("rejection_reason"):
            print(f"    rejected: {rec['rejection_reason']}")
        print()
    return 0


def _agent_type_for_rec(rec: dict) -> str:
    t = (rec.get("type") or "").lower()
    return {"onpage": "onpage", "content": "content"}.get(t, t or "unknown")


def cmd_approve(args: argparse.Namespace) -> int:
    db.init_db()
    rec_ids = None
    if args.rec_id:
        rec_ids = [r.strip() for r in args.rec_id.split(",") if r.strip()]

    pending_before = db.list_recommendations(args.run_id, status="PENDING")
    count = db.approve_recommendations(
        args.run_id,
        rec_ids=rec_ids,
        approve_all=args.all,
    )
    if args.all:
        to_log = pending_before
    elif rec_ids:
        to_log = [r for r in pending_before if r["recommendation_id"] in rec_ids]
    else:
        to_log = []
    for rec in to_log:
        db.save_human_feedback(
            args.run_id,
            rec["recommendation_id"],
            approved=True,
            rated_by=args.rated_by,
            agent_type=_agent_type_for_rec(rec),
        )
    print(f"Approved {count} recommendation(s) for run {args.run_id}")
    return 0 if count > 0 or args.all else 1


def cmd_reject(args: argparse.Namespace) -> int:
    db.init_db()
    ok = db.reject_recommendation(args.run_id, args.rec_id, args.reason)
    if ok:
        recs = db.list_recommendations(args.run_id, status="REJECTED")
        rec = next((r for r in recs if r["recommendation_id"] == args.rec_id), {})
        db.save_human_feedback(
            args.run_id,
            args.rec_id,
            approved=False,
            rejection_reason=args.reason,
            rated_by=getattr(args, "rated_by", None),
            agent_type=_agent_type_for_rec(rec),
        )
        print(f"Rejected {args.rec_id}")
        return 0
    print(f"Could not reject {args.rec_id} — not found?")
    return 1


def cmd_rate(args: argparse.Namespace) -> int:
    db.init_db()
    recs = db.list_recommendations(args.run_id)
    rec = next((r for r in recs if r["recommendation_id"] == args.rec_id), None)
    if not rec:
        print(f"Recommendation {args.rec_id} not found")
        return 1

    if not 1 <= args.score <= 5:
        print("Score must be 1–5")
        return 1

    db.save_human_feedback(
        args.run_id,
        args.rec_id,
        quality_score=args.score,
        rated_by=args.rated_by,
        agent_type=_agent_type_for_rec(rec),
    )
    db.compute_agent_accuracy()
    print(f"Rated {args.rec_id}: {args.score}/5")
    return 0


def cmd_activity(args: argparse.Namespace) -> int:
    db.init_db()
    rows = db.list_agent_activity(run_id=args.run_id, limit=args.limit)
    if not rows:
        if args.run_id:
            print(f"No activity logged for run {args.run_id}")
        else:
            print("No agent activity logged yet")
        return 0

    print(f"\nAgent activity ({len(rows)} entries):\n")
    print(f"{'Date':<22} {'Agent':<16} {'Task':<22} {'Status':<8} Detail / Error")
    print("-" * 100)
    for row in rows:
        date = (row.get("created_at") or "")[:19].replace("T", " ")
        agent = (row.get("agent") or "")[:15]
        task = (row.get("task") or "")[:21]
        status = row.get("status") or ""
        extra = row.get("detail") or row.get("error_message") or ""
        if extra and len(extra) > 45:
            extra = extra[:42] + "..."
        print(f"{date:<22} {agent:<16} {task:<22} {status:<8} {extra}")
    return 0


def cmd_apply(args: argparse.Namespace) -> int:
    db.init_db()
    result = apply_all_approved(args.run_id)
    onpage_ids = result["onpage"]
    content_ids = result["content"]

    if not onpage_ids and not content_ids:
        print("No approved ONPAGE or CONTENT recommendations to apply.")
        return 1

    if not args.no_git:
        branch = f"seo/{args.run_id[:8]}"
        subprocess.run(["git", "checkout", "-b", branch], cwd=config.REPO_ROOT, check=True)

    for rec_id in onpage_ids:
        print(f"  ✓ ONPAGE {rec_id}")
    for rec_id in content_ids:
        print(f"  ✓ CONTENT {rec_id}")

    total = len(onpage_ids) + len(content_ids)
    if total and not args.no_git:
        _git_commit_push(args.run_id, total)
        print(f"\nCommitted on branch seo/{args.run_id[:8]}")
    elif total:
        print(f"\nApplied {total} patch(es) (no-git mode)")

    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="JedMee SEO multi-agent system")
    sub = parser.add_subparsers(dest="command", required=True)

    p_collect = sub.add_parser("collect", help="DataCollector only (Steps 1–7)")
    p_collect.add_argument("--run-id")
    p_collect.add_argument("--trigger", default="manual", choices=["manual", "scheduled", "ci"])
    p_collect.add_argument("--goal", default="DataCollector — full pipeline")
    p_collect.add_argument("--skip-playwright", action="store_true")
    p_collect.set_defaults(func=cmd_collect)

    p_run = sub.add_parser("run", help="Full cycle: collect + all agents + stage for review")
    p_run.add_argument("--run-id")
    p_run.add_argument("--trigger", default="manual", choices=["manual", "scheduled", "ci"])
    p_run.add_argument("--goal", default="Weekly SEO audit — jedmee.com public pages")
    p_run.add_argument("--skip-playwright", action="store_true")
    p_run.add_argument("--skip-collect", action="store_true")
    p_run.set_defaults(func=cmd_run)

    p_deploy = sub.add_parser(
        "deploy",
        help="Production: run agents → auto-apply ONPAGE → GSC sitemap notify",
    )
    p_deploy.add_argument("--run-id")
    p_deploy.add_argument("--trigger", default="ci", choices=["manual", "scheduled", "ci"])
    p_deploy.add_argument("--goal", default="Post-deploy SEO auto-optimize")
    p_deploy.add_argument("--skip-playwright", action="store_true")
    p_deploy.add_argument("--skip-collect", action="store_true")
    p_deploy.add_argument(
        "--notify-gsc",
        action="store_true",
        default=True,
        help="Resubmit sitemap to Google Search Console (default: on)",
    )
    p_deploy.add_argument("--no-notify-gsc", action="store_false", dest="notify_gsc")
    p_deploy.add_argument("--push", action="store_true", help="Git commit+push applied patches")
    p_deploy.set_defaults(func=cmd_deploy)

    p_review = sub.add_parser("review", help="View recommendations for a run")
    p_review.add_argument("--run-id", required=True)
    p_review.add_argument("--status", choices=["PENDING", "APPROVED", "REJECTED"])
    p_review.set_defaults(func=cmd_review)

    p_approve = sub.add_parser("approve", help="Approve recommendations")
    p_approve.add_argument("--run-id", required=True)
    p_approve.add_argument("--rec-id", help="Comma-separated rec IDs, e.g. R001,R002")
    p_approve.add_argument("--all", action="store_true", help="Approve all pending")
    p_approve.add_argument("--rated-by", default="cli")
    p_approve.set_defaults(func=cmd_approve)

    p_reject = sub.add_parser("reject", help="Reject a recommendation")
    p_reject.add_argument("--run-id", required=True)
    p_reject.add_argument("--rec-id", required=True)
    p_reject.add_argument("--reason", required=True)
    p_reject.add_argument("--rated-by", default="cli")
    p_reject.set_defaults(func=cmd_reject)

    p_rate = sub.add_parser("rate", help="Rate recommendation quality 1–5")
    p_rate.add_argument("--run-id", required=True)
    p_rate.add_argument("--rec-id", required=True)
    p_rate.add_argument("--score", type=int, required=True, help="1–5 stars")
    p_rate.add_argument("--rated-by", default="cli")
    p_rate.set_defaults(func=cmd_rate)

    p_apply = sub.add_parser("apply", help="Apply approved ONPAGE changes")
    p_apply.add_argument("--run-id", required=True)
    p_apply.add_argument("--no-git", action="store_true", help="Patch files without git branch")
    p_apply.set_defaults(func=cmd_apply)

    p_activity = sub.add_parser("activity", help="View agent task activity log")
    p_activity.add_argument("--run-id", help="Filter by run ID")
    p_activity.add_argument("--limit", type=int, default=50)
    p_activity.set_defaults(func=cmd_activity)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
