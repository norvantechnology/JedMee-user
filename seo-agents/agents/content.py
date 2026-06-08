from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

import config
from tools.llm import LLMClient
from tools.scoring import priority_score


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class ContentAgent:
    name = "content"

    def __init__(self) -> None:
        self.llm = LLMClient()

    def run(self, ctx: dict[str, Any], tasks: list, results: dict[str, Any]) -> dict[str, Any]:
        technical = results.get("technical", {})
        blockers = [f for f in technical.get("findings", []) if f.get("severity", 0) >= 5]
        high_spa = any((p.get("spa_risk_score") or 0) >= 0.7 for p in ctx.get("pages", []))

        if blockers:
            return {
                "run_id": ctx.get("run_id"),
                "generated_at": _utc_now(),
                "agent": self.name,
                "status": "BLOCKED",
                "content_additions": [],
            }

        additions: list[dict[str, Any]] = []
        research = results.get("research", {})
        gsc_queries = ctx.get("gsc_queries", [])
        repo_pages = ctx.get("repo_parse", {}).get("pages", {})
        landing = repo_pages.get("/", {})
        faq_count = landing.get("seo_config", {}).get("faq_count", 0)

        for opp in research.get("opportunity_map", [])[:6]:
            if opp.get("recommended_action") != "EXPAND_SECTION":
                continue
            if high_spa and opp.get("target_page") != "/":
                continue

            query = opp.get("primary_query", "")
            gaps = opp.get("content_gaps", [])
            h2_topic = gaps[0] if gaps else query.title()
            body = (
                f"JedMee helps medicine shops manage {query} with tax-compliant billing, "
                "inventory tracking, and expiry alerts. Start a free trial — no credit card required."
            )

            if self.llm.available:
                drafted = self.llm.complete_text(
                    f"Write 2 sentences for JedMee pharmacy software about: {query}. "
                    f"Section heading: {h2_topic}. Factual, no hype."
                )
                if drafted:
                    body = drafted

            additions.append(
                {
                    "addition_id": f"CA{uuid.uuid4().hex[:4].upper()}",
                    "page": opp.get("target_page", "/"),
                    "section_type": "NEW_H2_SECTION",
                    "target_query": query,
                    "proposed_h2": h2_topic[:80],
                    "proposed_body": body,
                    "word_count": len(body.split()),
                    "priority_score": priority_score(3, 4, 3),
                    "evidence": {
                        "summary": f"GSC {opp.get('gsc_impressions_90d', 0)} impressions, pos {opp.get('jedmee_avg_position')}",
                        "gsc_impressions": opp.get("gsc_impressions_90d"),
                        "content_gaps": gaps[:3],
                    },
                    "requires_human_approval": True,
                    "approval_status": "PENDING",
                }
            )

        existing_faq_topics = set()
        for row in gsc_queries:
            q = row.get("query", "")
            if "?" not in q and not q.lower().startswith(("how", "what", "does", "can", "is")):
                continue
            if row.get("impressions", 0) < 30:
                continue
            if q in existing_faq_topics:
                continue
            existing_faq_topics.add(q)

            answer = (
                "JedMee provides pharmacy billing, inventory, and GST-compliant invoicing "
                "for medicine shops. Contact support for a free demo."
            )
            if self.llm.available:
                drafted = self.llm.complete_text(f"Answer in 2 sentences for FAQ: {q}")
                if drafted:
                    answer = drafted

            additions.append(
                {
                    "addition_id": f"CA{uuid.uuid4().hex[:4].upper()}",
                    "page": "/",
                    "section_type": "FAQ_ADDITION",
                    "faq_question": q,
                    "faq_answer": answer,
                    "priority_score": priority_score(2, 3, 2),
                    "evidence": {"gsc_impressions": row.get("impressions"), "summary": f"Query-style GSC: {q}"},
                    "requires_human_approval": True,
                    "approval_status": "PENDING",
                }
            )
            if len(additions) >= 10:
                break

        llms = ctx.get("repo_parse", {}).get("llms_txt", {})
        if llms.get("exists") and landing.get("seo_config", {}).get("faq_count", 0) > 0:
            additions.append(
                {
                    "addition_id": f"CA{uuid.uuid4().hex[:4].upper()}",
                    "page": "/",
                    "section_type": "LLMS_TXT_UPDATE",
                    "proposed_body": "Review llms.txt against current landing features after next content merge.",
                    "priority_score": priority_score(1, 2, 2),
                    "evidence": {"summary": f"llms.txt {llms.get('line_count')} lines; landing has {faq_count} FAQs"},
                    "requires_human_approval": True,
                    "approval_status": "PENDING",
                }
            )

        return {
            "run_id": ctx.get("run_id"),
            "generated_at": _utc_now(),
            "agent": self.name,
            "status": "READY",
            "content_mode": "RENDER_SAFE_ONLY" if high_spa else "FULL",
            "content_additions": additions[:8],
        }
