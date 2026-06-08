from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from agents.tasks import Task, tasks_to_graph
from tools import db


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class ManagerAgent:
    def __init__(self, run_id: str) -> None:
        self.run_id = run_id

    def plan_sprint(self, ctx: dict[str, Any], goal: str = "") -> list[Task]:
        tasks: list[Task] = []
        content_blocked = False

        for page in ctx.get("pages", []):
            path = page.get("path", "/")
            status = page.get("http_status")
            if status and status != 200:
                tasks.append(
                    Task(
                        type="TECHNICAL",
                        subtype="HTTP_ERROR",
                        page=path,
                        severity=5,
                        impact=5,
                        effort=1,
                        evidence=f"HTTP {status} on {path}",
                        assign_to="TechnicalAgent",
                        blocks=["ALL"],
                    )
                )
                content_blocked = True
                continue

            if page.get("has_noindex"):
                tasks.append(
                    Task(
                        type="TECHNICAL",
                        subtype="NOINDEX",
                        page=path,
                        severity=5,
                        impact=5,
                        effort=1,
                        evidence=f"noindex on {path}",
                        assign_to="TechnicalAgent",
                        blocks=["ALL"],
                    )
                )
                content_blocked = True

            spa = page.get("spa_risk_score") or 0
            if spa >= 0.5:
                tasks.append(
                    Task(
                        type="TECHNICAL",
                        subtype="SPA_PRERENDER",
                        page=path,
                        severity=5 if spa >= 0.7 else 4,
                        impact=5,
                        effort=4,
                        evidence=(
                            f"SPA risk {spa:.0%} on {path}. "
                            f"Flags: {', '.join(page.get('spa_risk_flags') or [])}"
                        ),
                        assign_to="TechnicalAgent",
                        blocks=["CONTENT", "ONPAGE"],
                    )
                )
                if spa >= 0.7:
                    content_blocked = True

        gsc_by_page = ctx.get("gsc_summary", {}).get("by_page", {})
        for path, gsc in gsc_by_page.items():
            anomalies = gsc.get("anomalies", [])
            top_queries = gsc.get("top_queries", [])

            if "low_ctr" in anomalies and top_queries:
                tasks.append(
                    Task(
                        type="ONPAGE",
                        subtype="TITLE_META_REWRITE",
                        page=path,
                        severity=4,
                        impact=4,
                        effort=2,
                        status="BLOCKED" if content_blocked else "READY",
                        evidence=(
                            f"Low CTR {gsc.get('ctr', 0):.2%} with "
                            f"{gsc.get('impressions', 0)} impressions on {path}"
                        ),
                        data={"top_query": top_queries[0]["query"]},
                        assign_to="OnPageAgent",
                    )
                )

            near_p2 = [
                q for q in top_queries if 10 < q.get("position", 0) <= 20 and q.get("impressions", 0) > 50
            ]
            if near_p2:
                tasks.append(
                    Task(
                        type="CONTENT",
                        subtype="SECTION_EXPANSION",
                        page=path,
                        severity=3,
                        impact=4,
                        effort=3,
                        status="BLOCKED" if content_blocked else "READY",
                        evidence=(
                            f"{len(near_p2)} queries at positions 11–20 on {path}. "
                            f"Top: {near_p2[0]['query']}"
                        ),
                        data={"queries": near_p2[:5]},
                        assign_to="ContentAgent",
                    )
                )

        pagespeed = ctx.get("pagespeed", {})
        for path, strategies in pagespeed.items():
            mobile = strategies.get("mobile", {}) if isinstance(strategies, dict) else {}
            if mobile.get("lcp_rating") == "poor" or (mobile.get("performance_score") or 100) < 70:
                tasks.append(
                    Task(
                        type="TECHNICAL",
                        subtype="CWV_POOR",
                        page=path,
                        severity=4,
                        impact=3,
                        effort=3,
                        evidence=f"Mobile LCP={mobile.get('lcp_ms')}ms score={mobile.get('performance_score')}",
                        assign_to="TechnicalAgent",
                    )
                )

        for issue in ctx.get("repo_parse", {}).get("issues", []):
            code = issue.get("code", "")
            if code == "CONTACT_MISSING_JSON_LD":
                tasks.append(
                    Task(
                        type="TECHNICAL",
                        subtype="MISSING_JSON_LD",
                        page="/contact",
                        severity=3,
                        impact=3,
                        effort=2,
                        evidence=issue.get("message", ""),
                        assign_to="TechnicalAgent",
                    )
                )

        if ctx.get("gsc_queries") or ctx.get("serp_snapshots"):
            tasks.append(
                Task(
                    type="RESEARCH",
                    subtype="OPPORTUNITY_MAP",
                    severity=3,
                    impact=4,
                    effort=2,
                    evidence="GSC/SERP data available for opportunity mapping",
                    assign_to="ResearchAgent",
                )
            )

        tasks.append(
            Task(
                type="ANALYTICS",
                subtype="WEEKLY_SUMMARY",
                severity=2,
                impact=3,
                effort=1,
                evidence="End-of-sprint analytics and feedback signals",
                assign_to="AnalyticsAgent",
            )
        )

        for t in tasks:
            t.compute_score()

        graph = tasks_to_graph(tasks)
        graph["goal"] = goal
        graph["planned_at"] = _utc_now()
        db.save_sprint(self.run_id, goal, json.dumps(graph))
        return tasks

    def synthesize(self, ctx: dict[str, Any], results: dict[str, Any]) -> dict[str, Any]:
        technical = results.get("technical", {})
        onpage = results.get("onpage", {})
        content = results.get("content", {})
        analytics = results.get("analytics", {})

        blockers = sum(1 for f in technical.get("findings", []) if f.get("severity", 0) >= 4)
        pending = (
            len(onpage.get("recommendations", []))
            + len(content.get("content_additions", []))
        )

        top_actions: list[dict[str, Any]] = []
        for f in sorted(technical.get("findings", []), key=lambda x: -x.get("severity", 0))[:2]:
            top_actions.append(
                {
                    "type": "TECHNICAL",
                    "priority": f.get("severity", 0) * 10,
                    "title": f.get("title"),
                    "page": f.get("page"),
                    "action": f.get("recommended_fix"),
                }
            )
        for rec in sorted(onpage.get("recommendations", []), key=lambda x: -x.get("priority_score", 0))[:2]:
            top_actions.append(
                {
                    "type": "ONPAGE",
                    "priority": rec.get("priority_score", 0),
                    "title": f"Update {rec.get('category')} on {rec.get('page')}",
                    "action": rec.get("proposed_state"),
                }
            )
        top_actions.sort(key=lambda a: -a.get("priority", 0))

        summary = {
            "run_id": self.run_id,
            "generated_at": _utc_now(),
            "health_status": "BLOCKED" if blockers > 0 else "HEALTHY",
            "critical_blockers": blockers,
            "recommendations_pending_review": pending,
            "analytics_summary": analytics.get("executive_summary", {}),
            "top_3_actions": top_actions[:3],
            "next_sprint_signals": analytics.get("manager_feedback", {}).get("signals_for_next_sprint", []),
        }
        return summary

    def stage_for_review(self, results: dict[str, Any]) -> int:
        count = 0
        onpage = results.get("onpage", {})
        content = results.get("content", {})

        for rec in onpage.get("recommendations", []):
            patch = rec.get("file_patch", {})
            db.save_recommendation(
                self.run_id,
                {
                    "recommendation_id": rec["rec_id"],
                    "type": "ONPAGE",
                    "page": rec.get("page"),
                    "category": rec.get("category"),
                    "file_path": patch.get("file"),
                    "field": patch.get("field"),
                    "old_value": rec.get("current_state"),
                    "new_value": rec.get("proposed_state"),
                    "rationale": rec.get("rationale"),
                    "priority_score": rec.get("priority_score"),
                },
            )
            count += 1

        for addition in content.get("content_additions", []):
            evidence = addition.get("evidence")
            if isinstance(evidence, dict):
                rationale = evidence.get("summary", "")
            else:
                rationale = str(evidence or "")

            db.save_recommendation(
                self.run_id,
                {
                    "recommendation_id": addition["addition_id"],
                    "type": "CONTENT",
                    "page": addition.get("page"),
                    "category": addition.get("section_type"),
                    "proposed_content": json.dumps(addition),
                    "rationale": rationale,
                    "priority_score": addition.get("priority_score", 50),
                },
            )
            count += 1

        return count
