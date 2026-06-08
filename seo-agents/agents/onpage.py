from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

import config
from tools.scoring import priority_score


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _full_title(segment: str) -> str:
    return f"{segment} — JedMee"


def _page_file(path: str) -> str:
    rel = config.FRONTEND_PAGES.get(path)
    return str(rel.relative_to(config.REPO_ROOT)) if rel else ""


class OnPageAgent:
    name = "onpage"

    def run(self, ctx: dict[str, Any], tasks: list, results: dict[str, Any]) -> dict[str, Any]:
        technical = results.get("technical", {})
        research = results.get("research", {})
        blockers = [f for f in technical.get("findings", []) if f.get("severity", 0) >= 5]

        if blockers:
            return {
                "run_id": ctx.get("run_id"),
                "generated_at": _utc_now(),
                "agent": self.name,
                "status": "BLOCKED",
                "blocked_by": [f["finding_id"] for f in blockers],
                "recommendations": [],
            }

        recommendations: list[dict[str, Any]] = []
        repo_pages = ctx.get("repo_parse", {}).get("pages", {})
        gsc_by_page = ctx.get("gsc_summary", {}).get("by_page", {})
        opportunities = {o["target_page"]: o for o in research.get("opportunity_map", [])}

        for path in config.PUBLIC_PATHS:
            repo = repo_pages.get(path, {})
            seo_meta = repo.get("use_seo_meta", {})
            current_title = seo_meta.get("title") or ""
            current_desc = seo_meta.get("description") or ""
            full_title = _full_title(current_title)

            gsc = gsc_by_page.get(path, {})
            top_query = None
            if gsc.get("top_queries"):
                top_query = gsc["top_queries"][0].get("query")

            title_len = len(full_title)
            if title_len < 50 or title_len > 65:
                rec_id = f"R{uuid.uuid4().hex[:4].upper()}"
                proposed = current_title
                if top_query and top_query.lower() not in current_title.lower():
                    proposed = f"{top_query.title()[:40]} | Free Trial"[:55]

                recommendations.append(
                    {
                        "rec_id": rec_id,
                        "page": path,
                        "category": "TITLE",
                        "priority_score": priority_score(3, 4, 2),
                        "current_state": current_title,
                        "proposed_state": proposed,
                        "rationale": (
                            f"Title length {title_len} chars (target 50–60). "
                            f"{f'Top GSC query: {top_query}' if top_query else 'No GSC data'}"
                        ),
                        "file_patch": {
                            "file": _page_file(path),
                            "change_type": "useSeoMeta",
                            "field": "title",
                        },
                        "requires_human_approval": True,
                        "approval_status": "PENDING",
                    }
                )

            desc_len = len(current_desc)
            if desc_len < 140 or desc_len > 165 or "low_ctr" in gsc.get("anomalies", []):
                rec_id = f"R{uuid.uuid4().hex[:4].upper()}"
                proposed_desc = current_desc
                if top_query and top_query.lower() not in current_desc.lower():
                    proposed_desc = (
                        f"JedMee — {top_query}. Tax billing, inventory, expiry alerts. "
                        "Free trial for medicine shops."
                    )[:160]

                recommendations.append(
                    {
                        "rec_id": rec_id,
                        "page": path,
                        "category": "META_DESCRIPTION",
                        "priority_score": priority_score(4, 4, 2) if "low_ctr" in gsc.get("anomalies", []) else priority_score(2, 3, 2),
                        "current_state": current_desc,
                        "proposed_state": proposed_desc,
                        "rationale": (
                            f"Description {desc_len} chars. "
                            f"CTR {gsc.get('ctr', 0):.2%} with {gsc.get('impressions', 0)} impressions."
                        ),
                        "file_patch": {
                            "file": _page_file(path),
                            "change_type": "useSeoMeta",
                            "field": "description",
                        },
                        "requires_human_approval": True,
                        "approval_status": "PENDING",
                    }
                )

            opp = opportunities.get(path)
            if opp and opp.get("primary_query"):
                kw = opp["primary_query"]
                keywords = seo_meta.get("keywords") or ""
                if kw.lower() not in keywords.lower():
                    rec_id = f"R{uuid.uuid4().hex[:4].upper()}"
                    recommendations.append(
                        {
                            "rec_id": rec_id,
                            "page": path,
                            "category": "KEYWORDS",
                            "priority_score": priority_score(2, 3, 1),
                            "current_state": keywords[:120] + ("..." if len(keywords) > 120 else ""),
                            "proposed_state": f"{kw}, {keywords}"[:200],
                            "rationale": f"Add GSC query '{kw}' to keywords ({opp.get('gsc_impressions_90d', 0)} impressions)",
                            "file_patch": {
                                "file": _page_file(path),
                                "change_type": "useSeoMeta",
                                "field": "keywords",
                            },
                            "requires_human_approval": True,
                            "approval_status": "PENDING",
                        }
                    )

        recommendations.sort(key=lambda r: -r.get("priority_score", 0))

        return {
            "run_id": ctx.get("run_id"),
            "generated_at": _utc_now(),
            "agent": self.name,
            "status": "READY",
            "recommendations": recommendations[:12],
        }
