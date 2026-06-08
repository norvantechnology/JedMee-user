from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class ResearchAgent:
    name = "research"

    def run(self, ctx: dict[str, Any], tasks: list) -> dict[str, Any]:
        gsc_queries = ctx.get("gsc_queries", [])
        serp_snapshots = ctx.get("serp_snapshots", [])
        competitor_pages = ctx.get("competitor_pages", [])
        pages_by_path = {p["path"]: p for p in ctx.get("pages", [])}

        clusters: dict[str, dict] = {}
        for row in sorted(gsc_queries, key=lambda q: -q.get("impressions", 0)):
            query = row.get("query", "").strip()
            if not query or row.get("impressions", 0) < 10:
                continue
            page = row.get("page", "/")
            key = f"{page}|{query[:40]}"
            if key in clusters:
                continue
            clusters[key] = {
                "cluster_id": f"c{len(clusters)+1:03d}",
                "primary_query": query,
                "related_queries": [query],
                "search_intent": "commercial" if "software" in query.lower() else "informational",
                "gsc_impressions_90d": row.get("impressions", 0),
                "jedmee_avg_position": row.get("position"),
                "target_page": page,
                "opportunity_score": round(
                    row.get("impressions", 0) / 500
                    + max(0, (20 - (row.get("position") or 20)) / 20) * 3,
                    1,
                ),
                "content_gaps": [],
                "recommended_action": "MONITOR" if row.get("position", 99) <= 10 else "EXPAND_SECTION",
                "recommended_agent": "ContentAgent" if row.get("position", 0) > 10 else "OnPageAgent",
            }

        for snap in serp_snapshots:
            query = snap.get("query")
            if not query:
                continue
            jedmee_pos = snap.get("jedmee_position")
            top_results = [r for r in snap.get("results", []) if r.get("position", 99) <= 3]
            comp_h2s: list[str] = []
            for comp in competitor_pages:
                if comp.get("query_context") == query and comp.get("fetched"):
                    comp_h2s.extend(comp.get("h2s") or [])

            page_h2s = pages_by_path.get("/", {}).get("h2_count", 0)
            paa = snap.get("people_also_ask") or []
            related = snap.get("related_searches") or []

            for cluster in clusters.values():
                if cluster["primary_query"] == query:
                    cluster["jedmee_serp_position"] = jedmee_pos
                    if top_results:
                        cluster["top_competitor"] = {
                            "url": top_results[0].get("url"),
                            "position": top_results[0].get("position"),
                            "title": top_results[0].get("title"),
                        }
                    if comp_h2s:
                        cluster["content_gaps"] = list(dict.fromkeys(comp_h2s[:8]))[:5]
                    if paa:
                        cluster["people_also_ask"] = [
                            p.get("question") for p in paa[:5] if p.get("question")
                        ]
                    if related:
                        cluster["related_searches"] = related[:8]
                    for comp in competitor_pages:
                        if comp.get("query_context") == query and comp.get("heading_hierarchy"):
                            cluster["competitor_heading_tree"] = comp["heading_hierarchy"][:20]
                            break
                    break

        opportunity_map = sorted(clusters.values(), key=lambda c: -c.get("opportunity_score", 0))[:15]

        return {
            "run_id": ctx.get("run_id"),
            "generated_at": _utc_now(),
            "agent": self.name,
            "opportunity_map": opportunity_map,
            "new_query_discoveries": [],
            "quota_used": ctx.get("serp_snapshots") and {"serp_queries": len(serp_snapshots)} or {},
        }
