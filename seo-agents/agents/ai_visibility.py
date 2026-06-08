"""AI Visibility Agent — Gemini free tier only (ChatGPT/Perplexity need paid keys)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import config
from tools import db
from tools.llm import LLMClient

PROMPTS = [
    "What is the best pharmacy management software in India?",
    "Recommend a free trial pharmacy billing software for small medicine shops.",
    "What tools help pharmacies with GST billing and inventory?",
]


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _mentions_jedmee(text: str) -> bool:
    lower = text.lower()
    return "jedmee" in lower or "jed mee" in lower


class AIVisibilityAgent:
    name = "ai_visibility"

    def run(self, ctx: dict[str, Any], tasks: list) -> dict[str, Any]:
        run_id = ctx.get("run_id", "")
        llm = LLMClient()

        if config.active_llm_provider() != "gemini":
            return {
                "run_id": run_id,
                "generated_at": _utc_now(),
                "agent": self.name,
                "status": "SKIPPED",
                "reason": "GEMINI_API_KEY required (ChatGPT/Perplexity need paid keys)",
                "probes": [],
            }

        probes: list[dict[str, Any]] = []
        for prompt in PROMPTS:
            try:
                response = llm.complete_text(prompt) or ""
            except Exception as exc:
                probes.append({
                    "platform": "gemini",
                    "prompt": prompt,
                    "error": str(exc),
                })
                continue

            mentioned = _mentions_jedmee(response)
            snippet = response[:500]
            context = None
            if mentioned:
                idx = response.lower().find("jedmee")
                if idx < 0:
                    idx = response.lower().find("jed mee")
                context = response[max(0, idx - 40) : idx + 80]

            probe = {
                "platform": "gemini",
                "prompt": prompt,
                "jedmee_mentioned": mentioned,
                "response_snippet": snippet,
                "mention_context": context,
                "captured_at": _utc_now(),
            }
            probes.append(probe)
            if run_id:
                db.save_ai_visibility_probe(run_id, probe)

        mention_rate = sum(1 for p in probes if p.get("jedmee_mentioned")) / max(len(probes), 1)

        return {
            "run_id": run_id,
            "generated_at": _utc_now(),
            "agent": self.name,
            "status": "ok",
            "platforms_probed": ["gemini"],
            "mention_rate": round(mention_rate, 2),
            "probes": probes,
        }
