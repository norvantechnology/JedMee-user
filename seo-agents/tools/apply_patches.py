"""Apply approved ONPAGE and CONTENT SEO patches to frontend JSX."""
from __future__ import annotations

from tools import db
from tools.content_patcher import apply_content_recommendation
from tools.jsx_patcher import patch_use_seo_meta_field


def apply_approved_onpage(run_id: str) -> list[str]:
    """Patch files for approved ONPAGE recommendations. Returns applied rec IDs."""
    applied_ids: list[str] = []
    for rec in db.get_approved_onpage_recommendations(run_id):
        file_path = rec.get("file_path")
        field = rec.get("field")
        new_value = rec.get("new_value")
        if not file_path or not field or not new_value:
            continue
        patch_use_seo_meta_field(file_path, field, new_value)
        applied_ids.append(rec["recommendation_id"])
    return applied_ids


def apply_approved_content(run_id: str) -> list[str]:
    """Apply approved CONTENT recommendations (FAQ additions only)."""
    applied_ids: list[str] = []
    for rec in db.get_approved_content_recommendations(run_id):
        if apply_content_recommendation(rec):
            applied_ids.append(rec["recommendation_id"])
    return applied_ids


def apply_all_approved(run_id: str) -> dict[str, list[str]]:
    return {
        "onpage": apply_approved_onpage(run_id),
        "content": apply_approved_content(run_id),
    }
