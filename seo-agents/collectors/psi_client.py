"""
DataCollector Step 4 — Google PageSpeed Insights.

Fetches Core Web Vitals and performance scores per public URL × strategy.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import requests

import config
from tools.quota_manager import QuotaManager

PSI_URL = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"
STRATEGIES = ("mobile", "desktop")


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _lcp_rating(lcp_ms: float | None) -> str:
    if lcp_ms is None:
        return "unknown"
    if lcp_ms <= 2500:
        return "good"
    if lcp_ms <= 4000:
        return "needs_improvement"
    return "poor"


def _cls_rating(cls_val: float | None) -> str:
    if cls_val is None:
        return "unknown"
    if cls_val <= 0.1:
        return "good"
    if cls_val <= 0.25:
        return "needs_improvement"
    return "poor"


def _metric_ms(audit: dict | None) -> float | None:
    if not audit:
        return None
    value = audit.get("numericValue")
    return round(float(value), 1) if value is not None else None


def _parse_psi_response(data: dict[str, Any]) -> dict[str, Any]:
    lighthouse = data.get("lighthouseResult", {})
    audits = lighthouse.get("audits", {})
    categories = lighthouse.get("categories", {})

    perf = categories.get("performance", {})
    perf_score = perf.get("score")
    perf_pct = round(perf_score * 100) if perf_score is not None else None

    lcp = _metric_ms(audits.get("largest-contentful-paint"))
    cls_val = audits.get("cumulative-layout-shift", {}).get("numericValue")
    inp = _metric_ms(audits.get("interaction-to-next-paint"))
    fcp = _metric_ms(audits.get("first-contentful-paint"))
    tbt = _metric_ms(audits.get("total-blocking-time"))

    return {
        "performance_score": perf_pct,
        "lcp_ms": lcp,
        "cls": round(float(cls_val), 3) if cls_val is not None else None,
        "inp_ms": inp,
        "fcp_ms": fcp,
        "tbt_ms": tbt,
        "lcp_rating": _lcp_rating(lcp),
        "cls_rating": _cls_rating(cls_val),
    }


def _fetch_psi(url: str, strategy: str, quota: QuotaManager) -> dict[str, Any]:
    cache_key = f"{url}|{strategy}"
    cached = quota.get_cached("psi", cache_key)
    if cached:
        parsed = _parse_psi_response(cached["data"])
        parsed["cached"] = True
        parsed["cache_age_hours"] = cached["age_hours"]
        return parsed

    if not config.GOOGLE_PSI_API_KEY:
        return {"error": "GOOGLE_PSI_API_KEY not set", "skipped": True}

    gate = quota.check_and_consume("psi")
    if gate == "CACHED":
        stale = quota.get_cached("psi", cache_key)
        if stale:
            parsed = _parse_psi_response(stale["data"])
            parsed["cached"] = True
            parsed["stale_cache"] = True
            return parsed
        return {"error": "PSI quota exhausted", "skipped": True}
    if gate is not True:
        return {"error": "PSI quota unavailable", "skipped": True}

    resp = requests.get(
        PSI_URL,
        params={
            "url": url,
            "strategy": strategy,
            "key": config.GOOGLE_PSI_API_KEY,
            "category": "performance",
        },
        timeout=60,
    )
    resp.raise_for_status()
    data = resp.json()
    quota.set_cache("psi", cache_key, data)

    parsed = _parse_psi_response(data)
    parsed["cached"] = False
    return parsed


def fetch_pagespeed() -> dict[str, Any]:
    """Fetch PSI for all public URLs. Returns pagespeed dict keyed by path."""
    if not config.GOOGLE_PSI_API_KEY:
        print("  ⚠ PSI skipped — GOOGLE_PSI_API_KEY not set in .env")
        return {"available": False, "reason": "missing_api_key", "by_path": {}}

    quota = QuotaManager()
    by_path: dict[str, Any] = {}

    for path in config.PUBLIC_PATHS:
        url = f"{config.SITE_URL}/" if path == "/" else f"{config.SITE_URL}{path}"
        by_path[path] = {}
        for strategy in STRATEGIES:
            try:
                result = _fetch_psi(url, strategy, quota)
                by_path[path][strategy] = result
                if result.get("skipped"):
                    print(f"  [{path}/{strategy}] skipped: {result.get('error')}")
                else:
                    score = result.get("performance_score")
                    lcp = result.get("lcp_ms")
                    cache_note = " (cached)" if result.get("cached") else ""
                    print(f"  [{path}/{strategy}] score={score} lcp={lcp}ms{cache_note}")
            except Exception as exc:
                by_path[path][strategy] = {"error": str(exc), "skipped": True}
                print(f"  [{path}/{strategy}] error: {exc}")

    return {
        "available": True,
        "fetched_at": _utc_now(),
        "by_path": by_path,
    }
