"""
DataCollector Step 7 — Render delta analysis.

Compares raw HTTP HTML vs Playwright-rendered HTML and computes SPA risk score.
"""
from __future__ import annotations

from typing import Any


def _norm(value: str | None) -> str:
    return (value or "").strip().lower()


def compute_spa_risk(raw: dict[str, Any], rendered: dict[str, Any]) -> dict[str, Any]:
    """
    Score 0.0 (no risk) → 1.0 (high risk) based on raw vs rendered differences.

    Signals:
      - title differs or missing in raw
      - meta description differs or missing in raw
      - schema only appears after render
      - rendered word count much higher than raw (JS-injected content)
    """
    flags: list[str] = []
    score = 0.0

    raw_title = raw.get("raw_title")
    rendered_title = rendered.get("rendered_title")
    raw_meta = raw.get("raw_meta_desc")
    rendered_meta = rendered.get("rendered_meta_desc")

    raw_words = raw.get("raw_word_count") or 0
    rendered_words = rendered.get("rendered_word_count") or 0

    raw_schema = raw.get("schema_count") or 0
    rendered_schema = rendered.get("rendered_schema_count") or 0

    if not raw_title and rendered_title:
        flags.append("RAW_TITLE_MISSING")
        score += 0.35
    elif _norm(raw_title) != _norm(rendered_title):
        flags.append("TITLE_MISMATCH")
        score += 0.25

    if not raw_meta and rendered_meta:
        flags.append("RAW_META_MISSING")
        score += 0.2
    elif raw_meta and rendered_meta and _norm(raw_meta) != _norm(rendered_meta):
        flags.append("META_MISMATCH")
        score += 0.15

    if rendered_schema > raw_schema:
        flags.append("SCHEMA_ONLY_AFTER_RENDER")
        score += 0.15

    if raw_words > 0 and rendered_words > raw_words * 1.5:
        flags.append("WORD_COUNT_RENDER_DELTA")
        score += 0.1
    elif raw_words == 0 and rendered_words > 100:
        flags.append("NO_RAW_TEXT")
        score += 0.2

    if rendered.get("render_error"):
        flags.append("RENDER_ERROR")
        score = max(score, 0.5)

    score = min(round(score, 2), 1.0)

    return {
        "spa_risk_score": score,
        "spa_risk_flags": flags,
        "title_match": _norm(raw_title) == _norm(rendered_title),
        "meta_match": _norm(raw_meta) == _norm(rendered_meta),
        "raw_word_count": raw_words,
        "rendered_word_count": rendered_words,
        "raw_schema_count": raw_schema,
        "rendered_schema_count": rendered_schema,
    }


def apply_render_delta(pages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Attach spa_risk fields to each merged page dict."""
    for page in pages:
        delta = compute_spa_risk(page, page)
        page.update(delta)

        risk = page["spa_risk_score"]
        flag_str = ", ".join(page["spa_risk_flags"]) or "none"
        print(f"  {page['path']}: spa_risk={risk} ({flag_str})")

    return pages
