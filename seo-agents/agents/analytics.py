from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from tools import db


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class AnalyticsAgent:
    name = "analytics"

    def run(self, ctx: dict[str, Any], tasks: list, results: dict[str, Any]) -> dict[str, Any]:
        gsc_by_page = ctx.get("gsc_summary", {}).get("by_page", {})
        prior = db.get_prior_gsc_totals(limit=1)

        signals: list[dict[str, Any]] = []
        wins: list[str] = []
        losses: list[str] = []

        total_impressions = sum(p.get("impressions", 0) for p in gsc_by_page.values())
        total_clicks = sum(p.get("clicks", 0) for p in gsc_by_page.values())

        if prior:
            prev_imp = prior[0].get("impressions", 0)
            prev_clicks = prior[0].get("clicks", 0)
            if total_impressions > prev_imp:
                wins.append(f"Impressions up {total_impressions - prev_imp} vs prior run")
            elif total_impressions < prev_imp:
                losses.append(f"Impressions down {prev_imp - total_impressions} vs prior run")
            if total_clicks > prev_clicks:
                wins.append(f"Clicks up {total_clicks - prev_clicks}")
        else:
            wins.append("Baseline run — no prior GSC comparison")

        for path, gsc in gsc_by_page.items():
            if gsc.get("impressions", 0) > 100 and gsc.get("ctr", 0) < 0.02:
                signals.append(
                    {
                        "type": "ONPAGE_CTR_OPPORTUNITY",
                        "weight": 8,
                        "route_to_agent": "OnPageAgent",
                        "evidence": f"{path} CTR {gsc.get('ctr', 0):.2%} on {gsc.get('impressions')} impressions",
                    }
                )
            for q in gsc.get("top_queries", []):
                pos = q.get("position", 99)
                if 8 <= pos <= 15:
                    signals.append(
                        {
                            "type": "CONTENT_NEAR_PAGE_ONE",
                            "weight": 7,
                            "route_to_agent": "ContentAgent",
                            "evidence": f"'{q.get('query')}' at position {pos}",
                        }
                    )

        technical = results.get("technical", {})
        if technical.get("summary", {}).get("blocker_count", 0) > 0:
            signals.append(
                {
                    "type": "FIX_BLOCKERS_BEFORE_OPTIMIZATION",
                    "weight": 10,
                    "route_to_agent": "TechnicalAgent",
                    "evidence": f"{technical['summary']['blocker_count']} technical blockers",
                }
            )

        onpage = results.get("onpage", {})
        if onpage.get("recommendations"):
            signals.append(
                {
                    "type": "PRIORITIZE_ONPAGE_APPROVAL",
                    "weight": 6,
                    "route_to_agent": "OnPageAgent",
                    "evidence": f"{len(onpage['recommendations'])} on-page recs pending review",
                }
            )

        db.save_gsc_baseline(ctx.get("run_id"), total_impressions, total_clicks)

        return {
            "run_id": ctx.get("run_id"),
            "generated_at": _utc_now(),
            "agent": self.name,
            "executive_summary": {
                "total_impressions_90d": total_impressions,
                "total_clicks_90d": total_clicks,
                "wins": wins[:5],
                "losses": losses[:5],
                "focus_next_sprint": signals[0]["type"] if signals else "MAINTAIN",
            },
            "manager_feedback": {
                "signals_for_next_sprint": sorted(signals, key=lambda s: -s.get("weight", 0))[:8],
            },
        }
