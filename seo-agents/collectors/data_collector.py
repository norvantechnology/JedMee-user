"""
DataCollector orchestrator.

Steps 1–3, 7: crawl, render, repo parse, SPA delta
Steps 4–6: PSI, GSC, SERP (require API credentials)
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

import config
from collectors.gsc_client import fetch_gsc_data
from collectors.http_crawler import crawl_all_public_pages
from collectors.playwright_crawler import render_all_public_pages
from collectors.psi_client import fetch_pagespeed
from collectors.repo_parser import parse_repo
from collectors.render_delta import apply_render_delta
from collectors.serp_client import fetch_serp_data
from tools import db
from tools import activity_log


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _merge_page_data(raw_pages: list[dict], rendered_pages: list[dict]) -> list[dict[str, Any]]:
    rendered_by_path = {p["path"]: p for p in rendered_pages}
    merged: list[dict[str, Any]] = []

    for raw in raw_pages:
        rendered = rendered_by_path.get(raw["path"], {})
        page = {**raw, **rendered}
        page["captured_at"] = raw.get("captured_at") or _utc_now()
        merged.append(page)

    return merged


def _build_page_summary(page: dict[str, Any]) -> dict[str, Any]:
    return {
        "path": page["path"],
        "url": page["url"],
        "http_status": page.get("http_status"),
        "response_time_ms": page.get("response_time_ms"),
        "raw_title": page.get("raw_title"),
        "raw_meta_desc": page.get("raw_meta_desc"),
        "rendered_title": page.get("rendered_title"),
        "rendered_meta_desc": page.get("rendered_meta_desc"),
        "canonical_url": page.get("canonical_url"),
        "has_noindex": page.get("has_noindex"),
        "h1": page.get("h1"),
        "h2_count": len(page.get("h2s") or []),
        "h3_count": len(page.get("h3s") or []),
        "raw_word_count": page.get("raw_word_count"),
        "rendered_word_count": page.get("rendered_word_count"),
        "raw_schema_count": page.get("schema_count"),
        "rendered_schema_count": page.get("rendered_schema_count"),
        "raw_schema_types": page.get("raw_schema_types", []),
        "rendered_schema_types": page.get("rendered_schema_types", []),
        "spa_risk_score": page.get("spa_risk_score"),
        "spa_risk_flags": page.get("spa_risk_flags", []),
        "title_match": page.get("title_match"),
        "meta_match": page.get("meta_match"),
        "render_error": page.get("render_error"),
    }


def _assess_data_quality(
    steps_completed: list[str],
    pages: list[dict],
    gsc_data: dict,
    serp_data: dict,
    pagespeed: dict,
) -> str:
    api_steps = {"pagespeed", "gsc", "serp"}
    api_done = api_steps.intersection(steps_completed)

    if api_done == api_steps:
        label = "FULL"
    elif api_done:
        label = "PARTIAL"
    else:
        label = "PARTIAL"

    if "gsc" not in steps_completed or not gsc_data.get("available"):
        label = "PARTIAL_NO_GSC" if label == "PARTIAL" else label

    high_risk = any((p.get("spa_risk_score") or 0) >= 0.5 for p in pages)
    if high_risk and label == "FULL":
        label = "FULL_SPA_RISK"

    if not pagespeed.get("available") and "pagespeed" not in steps_completed:
        pass

    if not serp_data.get("available"):
        if label == "FULL":
            label = "PARTIAL_NO_SERP"

    return label


def collect(run_id: str, skip_playwright: bool = False) -> dict[str, Any]:
    """Run all collector steps and build run_context.json."""
    db.init_db()
    steps_completed: list[str] = []
    api_status: dict[str, str] = {}

    print("\n[DataCollector] Step 1 — Raw HTTP crawl")
    try:
        raw_pages = crawl_all_public_pages()
        steps_completed.append("raw_http")
        activity_log.log_ok(
            run_id, "DataCollector", "raw_http",
            detail=f"{len(raw_pages)} pages crawled",
        )
    except Exception as exc:
        activity_log.log_error(run_id, "DataCollector", "raw_http", exc)
        raise

    rendered_pages: list[dict[str, Any]] = []
    if skip_playwright:
        print("\n[DataCollector] Step 2 — Playwright render (SKIPPED)")
        api_status["playwright"] = "skipped"
        activity_log.log_skip(run_id, "DataCollector", "playwright_render")
    else:
        print("\n[DataCollector] Step 2 — Playwright render")
        try:
            rendered_pages = render_all_public_pages()
            steps_completed.append("playwright_render")
            api_status["playwright"] = "ok"
            activity_log.log_ok(
                run_id, "DataCollector", "playwright_render",
                detail=f"{len(rendered_pages)} pages rendered",
            )
        except RuntimeError as exc:
            print(f"  ⚠ Playwright skipped: {exc}")
            api_status["playwright"] = f"error: {exc}"
            activity_log.log_warn(
                run_id, "DataCollector", "playwright_render", detail=str(exc),
            )

    print("\n[DataCollector] Step 3 — Repo parse")
    try:
        repo_parse = parse_repo()
        steps_completed.append("repo_parse")
        activity_log.log_ok(
            run_id, "DataCollector", "repo_parse",
            detail=f"{len(repo_parse.get('pages', []))} repo pages",
        )
    except Exception as exc:
        activity_log.log_error(run_id, "DataCollector", "repo_parse", exc)
        raise

    pages = _merge_page_data(raw_pages, rendered_pages)

    if rendered_pages:
        print("\n[DataCollector] Step 7 — Render delta analysis")
        try:
            pages = apply_render_delta(pages)
            steps_completed.append("render_delta")
            high_risk_count = sum(1 for p in pages if (p.get("spa_risk_score") or 0) >= 0.5)
            activity_log.log_ok(
                run_id, "DataCollector", "render_delta",
                detail=f"high SPA risk pages: {high_risk_count}",
            )
        except Exception as exc:
            activity_log.log_error(run_id, "DataCollector", "render_delta", exc)
            raise

    print("\n[DataCollector] Step 4 — PageSpeed Insights")
    try:
        pagespeed = fetch_pagespeed()
        if pagespeed.get("available"):
            steps_completed.append("pagespeed")
            api_status["psi"] = "ok"
            activity_log.log_ok(run_id, "DataCollector", "pagespeed")
        else:
            reason = pagespeed.get("reason", "skipped")
            api_status["psi"] = reason
            activity_log.log_skip(
                run_id, "DataCollector", "pagespeed", detail=reason,
            )
    except Exception as exc:
        api_status["psi"] = f"error: {exc}"
        activity_log.log_error(run_id, "DataCollector", "pagespeed", exc)

    print("\n[DataCollector] Step 5 — Google Search Console")
    try:
        gsc_data = fetch_gsc_data()
        if gsc_data.get("available"):
            steps_completed.append("gsc")
            api_status["gsc"] = "ok" if not gsc_data.get("cached") else "cached"
            activity_log.log_ok(run_id, "DataCollector", "gsc", detail=api_status["gsc"])
        else:
            reason = gsc_data.get("reason", "skipped")
            api_status["gsc"] = reason
            activity_log.log_skip(run_id, "DataCollector", "gsc", detail=reason)
    except Exception as exc:
        gsc_data = {"available": False, "reason": str(exc)}
        api_status["gsc"] = f"error: {exc}"
        activity_log.log_error(run_id, "DataCollector", "gsc", exc)

    print("\n[DataCollector] Step 6 — SERP + competitor pages")
    try:
        serp_data = fetch_serp_data(run_id, gsc_data)
        if serp_data.get("available"):
            steps_completed.append("serp")
            api_status["serp"] = "ok"
            activity_log.log_ok(
                run_id, "DataCollector", "serp",
                detail=f"queries: {serp_data.get('queries_fetched', 0)}",
            )
        else:
            reason = serp_data.get("reason", "skipped")
            api_status["serp"] = reason
            activity_log.log_skip(run_id, "DataCollector", "serp", detail=reason)
    except Exception as exc:
        serp_data = {"available": False, "reason": str(exc)}
        api_status["serp"] = f"error: {exc}"
        activity_log.log_error(run_id, "DataCollector", "serp", exc)

    for page in pages:
        db.save_page_snapshot(run_id, page)

    all_steps = [
        "raw_http",
        "playwright_render",
        "repo_parse",
        "pagespeed",
        "gsc",
        "serp",
        "render_delta",
    ]
    steps_pending = [s for s in all_steps if s not in steps_completed]

    high_risk = [p for p in pages if (p.get("spa_risk_score") or 0) >= 0.5]
    data_quality = _assess_data_quality(
        steps_completed, pages, gsc_data, serp_data, pagespeed
    )

    gsc_summary = {
        "period": gsc_data.get("period"),
        "start_date": gsc_data.get("start_date"),
        "end_date": gsc_data.get("end_date"),
        "available": gsc_data.get("available", False),
        "by_page": gsc_data.get("by_page", {}),
    }

    run_context: dict[str, Any] = {
        "run_id": run_id,
        "generated_at": _utc_now(),
        "site_url": config.SITE_URL,
        "data_quality": data_quality,
        "steps_completed": steps_completed,
        "steps_pending": steps_pending,
        "api_status": api_status,
        "repo_parse": repo_parse,
        "pages": [_build_page_summary(p) for p in pages],
        "pagespeed": pagespeed.get("by_path", {}),
        "gsc_summary": gsc_summary,
        "gsc_queries": gsc_data.get("queries", []),
        "serp_snapshots": serp_data.get("snapshots", []),
        "competitor_pages": serp_data.get("competitor_pages", []),
        "summary": {
            "total_pages": len(pages),
            "high_spa_risk_pages": [p["path"] for p in high_risk],
            "repo_issues_count": len(repo_parse.get("issues", [])),
            "avg_spa_risk": round(
                sum(p.get("spa_risk_score") or 0 for p in pages) / max(len(pages), 1),
                2,
            ),
            "gsc_total_impressions": sum(
                p.get("impressions", 0) for p in gsc_data.get("by_page", {}).values()
            ),
            "serp_queries_fetched": serp_data.get("queries_fetched", 0),
            "competitor_pages_fetched": sum(
                1 for c in serp_data.get("competitor_pages", []) if c.get("fetched")
            ),
        },
    }

    out_dir = config.OUTPUTS_DIR / run_id
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "run_context.json"
    out_path.write_text(json.dumps(run_context, indent=2), encoding="utf-8")

    # Also save serp snapshot as standalone file for agent consumption
    if serp_data.get("snapshots"):
        serp_path = out_dir / "serp_snapshot.json"
        serp_path.write_text(
            json.dumps(
                {
                    "run_id": run_id,
                    "generated_at": _utc_now(),
                    "snapshots": serp_data["snapshots"],
                    "quota_used": serp_data.get("quota_used", {}),
                },
                indent=2,
            ),
            encoding="utf-8",
        )

    print(f"\n[DataCollector] Saved → {out_path}")
    print(f"  Steps completed: {', '.join(steps_completed)}")
    if steps_pending:
        print(f"  Steps pending: {', '.join(steps_pending)}")
    print(f"  Data quality: {data_quality}")

    activity_log.log_ok(
        run_id, "DataCollector", "build_context",
        detail=f"quality={data_quality}, steps={len(steps_completed)}",
    )

    return run_context
