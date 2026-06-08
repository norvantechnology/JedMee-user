"""Full SEO agent cycle: collect → plan → workers → synthesize → stage."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import config
from agents.analytics import AnalyticsAgent
from agents.content import ContentAgent
from agents.manager import ManagerAgent
from agents.onpage import OnPageAgent
from agents.research import ResearchAgent
from agents.technical import TechnicalAgent
from collectors.data_collector import collect
from tools import db
from tools import activity_log


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _save_json(run_id: str, name: str, data: dict[str, Any]) -> Path:
    out_dir = config.OUTPUTS_DIR / run_id
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / name
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    db.save_agent_output(run_id, name.replace(".json", ""), data)
    return path


def _write_report(run_id: str, executive: dict, results: dict) -> Path:
    lines = [
        f"# SEO Run Report — {run_id}",
        f"Generated: {executive.get('generated_at', _utc_now())}",
        f"Health: **{executive.get('health_status')}**",
        "",
        "## Top actions",
    ]
    for action in executive.get("top_3_actions", []):
        lines.append(f"- [{action.get('type')}] {action.get('title')}: {action.get('action')}")

    lines.extend(["", "## Pending review", f"- {executive.get('recommendations_pending_review', 0)} recommendations"])
    lines.extend(["", "## Technical findings", ""])
    for f in results.get("technical", {}).get("findings", [])[:5]:
        lines.append(f"- **{f.get('title')}** ({f.get('page')})")

    path = config.OUTPUTS_DIR / run_id / "report.md"
    path.write_text("\n".join(lines), encoding="utf-8")
    return path


_AGENT_OUTPUT_FILES = {
    "TechnicalAgent": "technical.json",
    "ResearchAgent": "research.json",
    "OnPageAgent": "onpage.json",
    "ContentAgent": "content.json",
    "AnalyticsAgent": "analytics.json",
}


def _run_agent(
    run_id: str,
    agent_name: str,
    task: str,
    runner,
) -> dict[str, Any]:
    print(f"\n[{agent_name}] Running...")
    try:
        result = runner()
        _save_json(run_id, _AGENT_OUTPUT_FILES[agent_name], result)
        detail = _agent_detail(agent_name, result)
        activity_log.log_ok(run_id, agent_name, task, detail=detail)
        print(f"  {detail}")
        return result
    except Exception as exc:
        activity_log.log_error(run_id, agent_name, task, exc)
        raise


def _agent_detail(agent_name: str, result: dict[str, Any]) -> str:
    if agent_name == "TechnicalAgent":
        return f"Findings: {len(result.get('findings', []))}"
    if agent_name == "ResearchAgent":
        return f"Opportunities: {len(result.get('opportunity_map', []))}"
    if agent_name == "OnPageAgent":
        return (
            f"Status: {result.get('status')} — "
            f"recs: {len(result.get('recommendations', []))}"
        )
    if agent_name == "ContentAgent":
        return f"Additions: {len(result.get('content_additions', []))}"
    if agent_name == "AnalyticsAgent":
        return f"Status: {result.get('status', 'ok')}"
    return "completed"


def run_full_cycle(
    run_id: str,
    goal: str = "Weekly SEO audit",
    skip_playwright: bool = False,
    skip_collect: bool = False,
) -> dict[str, Any]:
    db.init_db()

    if skip_collect:
        ctx_path = config.OUTPUTS_DIR / run_id / "run_context.json"
        if not ctx_path.exists():
            activity_log.log_error(
                run_id, "DataCollector", "load_context",
                f"No run_context.json for run_id {run_id}",
            )
            raise FileNotFoundError(f"No run_context.json for run_id {run_id}")
        ctx = json.loads(ctx_path.read_text(encoding="utf-8"))
        activity_log.log_skip(run_id, "DataCollector", "collect", detail="skip_collect=true")
    else:
        ctx = collect(run_id, skip_playwright=skip_playwright)

    ctx["run_id"] = run_id
    manager = ManagerAgent(run_id)

    print("\n[Manager] Planning sprint...")
    try:
        tasks = manager.plan_sprint(ctx, goal=goal)
        task_graph = json.loads(db.get_sprint(run_id)["task_graph_json"])
        _save_json(run_id, "task_graph.json", task_graph)
        activity_log.log_ok(
            run_id, "Manager", "plan_sprint",
            detail=f"Tasks planned: {len(tasks)}",
        )
        print(f"  Tasks planned: {len(tasks)}")
    except Exception as exc:
        activity_log.log_error(run_id, "Manager", "plan_sprint", exc)
        raise

    results: dict[str, Any] = {}

    results["technical"] = _run_agent(
        run_id, "TechnicalAgent", "audit_technical",
        lambda: TechnicalAgent().run(ctx, tasks),
    )
    results["research"] = _run_agent(
        run_id, "ResearchAgent", "research_opportunities",
        lambda: ResearchAgent().run(ctx, tasks),
    )
    results["onpage"] = _run_agent(
        run_id, "OnPageAgent", "onpage_recommendations",
        lambda: OnPageAgent().run(ctx, tasks, results),
    )
    results["content"] = _run_agent(
        run_id, "ContentAgent", "content_additions",
        lambda: ContentAgent().run(ctx, tasks, results),
    )
    results["analytics"] = _run_agent(
        run_id, "AnalyticsAgent", "analytics_summary",
        lambda: AnalyticsAgent().run(ctx, tasks, results),
    )

    print("\n[AIVisibilityAgent] Running...")
    try:
        av_result = AIVisibilityAgent().run(ctx, tasks)
        _save_json(run_id, "ai_visibility.json", av_result)
        status = av_result.get("status", "ok")
        if status == "SKIPPED":
            activity_log.log_skip(
                run_id, "AIVisibilityAgent", "probe",
                detail=av_result.get("reason"),
            )
        else:
            activity_log.log_ok(
                run_id, "AIVisibilityAgent", "probe",
                detail=f"mention_rate={av_result.get('mention_rate')}",
            )
        results["ai_visibility"] = av_result
    except Exception as exc:
        activity_log.log_error(run_id, "AIVisibilityAgent", "probe", exc)
        results["ai_visibility"] = {"status": "error", "error": str(exc)}

    print("\n[Manager] Synthesizing...")
    try:
        executive = manager.synthesize(ctx, results)
        executive["agent_outputs"] = {
            k: {"status": v.get("status", "ok")} for k, v in results.items()
        }
        _save_json(run_id, "executive_summary.json", executive)
        activity_log.log_ok(
            run_id, "Manager", "synthesize",
            detail=f"Health: {executive.get('health_status')}",
        )
    except Exception as exc:
        activity_log.log_error(run_id, "Manager", "synthesize", exc)
        raise

    try:
        pending = manager.stage_for_review(results)
        _write_report(run_id, executive, results)
        activity_log.log_ok(
            run_id, "Manager", "stage_for_review",
            detail=f"Staged {pending} recommendations",
        )
    except Exception as exc:
        activity_log.log_error(run_id, "Manager", "stage_for_review", exc)
        raise

    print(f"\n[Manager] Staged {pending} recommendations for human review")
    print(f"  Review: python main.py review --run-id {run_id}")

    return {
        "run_id": run_id,
        "executive_summary": executive,
        "pending_recommendations": pending,
    }
