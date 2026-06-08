"""Apply approved CONTENT recommendations (FAQ additions to LandingPage)."""
from __future__ import annotations

import json
import re
from pathlib import Path

import config


def _escape_js_string(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")


def append_faq_to_landing(question: str, answer: str) -> bool:
    """Append one FAQ entry to SEO_CONFIG.faqs in LandingPage.jsx."""
    path = config.FRONTEND_PAGES["/"]
    if not path.exists():
        return False

    source = path.read_text(encoding="utf-8")
    if question in source:
        return False

    faq_entry = (
        f"    {{\n"
        f'      q: "{_escape_js_string(question)}",\n'
        f'      a: "{_escape_js_string(answer)}",\n'
        f"    }},"
    )

    match = re.search(r"(faqs:\s*\[)([\s\S]*?)(\n\s*\],)", source)
    if not match:
        return False

    new_block = match.group(1) + match.group(2) + "\n" + faq_entry + match.group(3)
    updated = source[: match.start()] + new_block + source[match.end() :]
    path.write_text(updated, encoding="utf-8")
    return True


def apply_content_recommendation(rec: dict) -> bool:
    """Apply one approved CONTENT rec. Returns True if file changed."""
    raw = rec.get("proposed_content") or ""
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return False

    section_type = data.get("section_type") or rec.get("category")
    if section_type == "FAQ_ADDITION":
        q = data.get("faq_question") or ""
        a = data.get("faq_answer") or ""
        if q and a:
            return append_faq_to_landing(q, a)
    return False
