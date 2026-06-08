"""
DataCollector Step 6 — SERP capture + competitor page fetch.

Uses SerpAPI (primary) or Google Custom Search (fallback).
Query list built from GSC top queries per page.
"""
from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

import config
from collectors.html_extract import extract_json_ld, parse_html_snapshot
from tools import db
from tools.quota_manager import QuotaManager

SERPAPI_URL = "https://serpapi.com/search.json"
CSE_URL = "https://www.googleapis.com/customsearch/v1"
MAX_QUERIES_PER_RUN = 20
COMPETITOR_FETCH_TOP_N = 5
USER_AGENT = "JedMee-SEO-DataCollector/1.0 (+https://jedmee.com)"


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _is_jedmee_url(url: str) -> bool:
    try:
        host = urlparse(url).netloc.lower()
        return "jedmee.com" in host
    except Exception:
        return False


def _select_queries(gsc_data: dict[str, Any]) -> list[str]:
    if not gsc_data.get("available"):
        return []

    seen: set[str] = set()
    selected: list[str] = []

    by_page = gsc_data.get("by_page", {})
    for path in config.PUBLIC_PATHS:
        page_data = by_page.get(path, {})
        for row in page_data.get("top_queries", [])[:5]:
            q = (row.get("query") or "").strip()
            if not q or q in seen:
                continue
            seen.add(q)
            selected.append(q)

    selected.sort(
        key=lambda q: next(
            (
                r["impressions"]
                for r in gsc_data.get("queries", [])
                if r.get("query") == q
            ),
            0,
        ),
        reverse=True,
    )
    return selected[:MAX_QUERIES_PER_RUN]


def _parse_serpapi_organic(data: dict[str, Any]) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for item in data.get("organic_results", []):
        results.append(
            {
                "position": item.get("position"),
                "url": item.get("link"),
                "title": item.get("title"),
                "meta_description": item.get("snippet"),
            }
        )
    return results


def _parse_serpapi_extras(data: dict[str, Any]) -> dict[str, Any]:
    paa: list[dict[str, Any]] = []
    for item in data.get("related_questions", []):
        paa.append(
            {
                "question": item.get("question"),
                "snippet": item.get("snippet"),
                "link": item.get("link"),
            }
        )

    related = [
        r.get("query") or r.get("text") or str(r)
        for r in data.get("related_searches", [])
        if r
    ]

    answer_box = data.get("answer_box")
    if isinstance(answer_box, dict):
        ab = {
            "title": answer_box.get("title"),
            "snippet": answer_box.get("snippet") or answer_box.get("answer"),
            "link": answer_box.get("link"),
        }
    else:
        ab = None

    return {
        "people_also_ask": paa,
        "related_searches": related,
        "answer_box": ab,
    }


def _parse_serpapi_payload(data: dict[str, Any]) -> list[dict[str, Any]]:
    return _parse_serpapi_organic(data)


def _parse_cse_payload(data: dict[str, Any]) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for idx, item in enumerate(data.get("items", []), start=1):
        results.append(
            {
                "position": idx,
                "url": item.get("link"),
                "title": item.get("title"),
                "meta_description": item.get("snippet"),
            }
        )
    return results


def _find_jedmee_position(results: list[dict[str, Any]]) -> int | None:
    for row in results:
        url = row.get("url") or ""
        if _is_jedmee_url(url):
            return row.get("position")
    return None


def _fetch_serp_serpapi(
    query: str, quota: QuotaManager,
) -> tuple[list[dict], str, bool, dict[str, Any]]:
    cache_key = query.lower().strip()
    cached = quota.get_cached("serpapi", cache_key)
    if cached:
        data = cached["data"]
        return _parse_serpapi_organic(data), "serpapi", True, _parse_serpapi_extras(data)

    if not config.SERPAPI_KEY:
        raise RuntimeError("SERPAPI_KEY not set")

    gate = quota.check_and_consume("serpapi")
    if gate == "CACHED":
        stale = quota.get_cached("serpapi", cache_key)
        if stale:
            data = stale["data"]
            return _parse_serpapi_organic(data), "serpapi", True, _parse_serpapi_extras(data)
        raise RuntimeError("SerpAPI quota exhausted")

    resp = requests.get(
        SERPAPI_URL,
        params={
            "q": query,
            "location": "India",
            "gl": "in",
            "hl": "en",
            "google_domain": "google.co.in",
            "api_key": config.SERPAPI_KEY,
            "num": 10,
        },
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    quota.set_cache("serpapi", cache_key, data)
    return _parse_serpapi_organic(data), "serpapi", False, _parse_serpapi_extras(data)


def _fetch_serp_cse(query: str, quota: QuotaManager) -> tuple[list[dict], str, bool, dict[str, Any]]:
    cache_key = query.lower().strip()
    cached = quota.get_cached("google_cse", cache_key)
    if cached:
        return _parse_cse_payload(cached["data"]), "google_cse", True, {}

    if not config.GOOGLE_CSE_API_KEY or not config.GOOGLE_CSE_CX:
        raise RuntimeError("Google CSE credentials not set")

    gate = quota.check_and_consume("google_cse")
    if gate == "CACHED":
        stale = quota.get_cached("google_cse", cache_key)
        if stale:
            return _parse_cse_payload(stale["data"]), "google_cse", True, {}
        raise RuntimeError("Google CSE quota exhausted")

    resp = requests.get(
        CSE_URL,
        params={
            "q": query,
            "key": config.GOOGLE_CSE_API_KEY,
            "cx": config.GOOGLE_CSE_CX,
            "num": 10,
        },
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    quota.set_cache("google_cse", cache_key, data)
    return _parse_cse_payload(data), "google_cse", False, {}


def _fetch_serp(
    query: str, quota: QuotaManager,
) -> tuple[list[dict], str, bool, dict[str, Any], str | None]:
    errors: list[str] = []
    if config.SERPAPI_KEY:
        try:
            results, source, cached, extras = _fetch_serp_serpapi(query, quota)
            return results, source, cached, extras, None
        except Exception as exc:
            errors.append(f"serpapi: {exc}")

    if config.GOOGLE_CSE_API_KEY and config.GOOGLE_CSE_CX:
        try:
            results, source, cached, extras = _fetch_serp_cse(query, quota)
            return results, source, cached, extras, None
        except Exception as exc:
            errors.append(f"cse: {exc}")

    return [], "none", False, {}, "; ".join(errors) or "no_serp_credentials"


def _fetch_competitor_page(url: str, query: str, position: int) -> dict[str, Any]:
    base = {
        "url": url,
        "query_context": query,
        "serp_position": position,
        "fetched": False,
        "fetch_error": None,
    }
    if _is_jedmee_url(url):
        base["is_jedmee"] = True
        return base

    try:
        resp = requests.get(
            url,
            headers={"User-Agent": USER_AGENT},
            timeout=15,
            allow_redirects=True,
        )
        resp.raise_for_status()
        parsed = parse_html_snapshot(resp.text)
        soup = BeautifulSoup(resp.text, "html.parser")
        schema_blocks = extract_json_ld(soup)
        schema_types = sorted(
            {b.get("@type") for b in schema_blocks if isinstance(b, dict) and b.get("@type")}
        )

        base.update(
            {
                "fetched": True,
                "http_status": resp.status_code,
                "title": parsed.get("title"),
                "meta_desc": parsed.get("meta_desc"),
                "h1": parsed.get("h1"),
                "h2s": parsed.get("h2s", []),
                "h3s": parsed.get("h3s", []),
                "h4s": parsed.get("h4s", []),
                "heading_hierarchy": parsed.get("heading_hierarchy", []),
                "word_count": parsed.get("word_count", 0),
                "has_faq_schema": any(
                    t in ("FAQPage", "Question") for t in schema_types
                ),
                "has_review_schema": any(
                    t in ("Review", "AggregateRating", "Product") for t in schema_types
                ),
                "schema_types": schema_types,
            }
        )
    except Exception as exc:
        base["fetch_error"] = str(exc)

    return base


def fetch_serp_data(run_id: str, gsc_data: dict[str, Any]) -> dict[str, Any]:
    """Fetch SERP snapshots and competitor pages for GSC-driven queries."""
    queries = _select_queries(gsc_data)

    if not queries:
        print("  ⚠ SERP skipped — no GSC queries available (set up GSC first)")
        return {
            "available": False,
            "reason": "no_queries",
            "snapshots": [],
            "competitor_pages": [],
            "quota_used": {},
        }

    if not config.SERPAPI_KEY and not (config.GOOGLE_CSE_API_KEY and config.GOOGLE_CSE_CX):
        print("  ⚠ SERP skipped — SERPAPI_KEY or Google CSE credentials not set")
        return {
            "available": False,
            "reason": "missing_credentials",
            "queries_planned": queries,
            "snapshots": [],
            "competitor_pages": [],
            "quota_used": {},
        }

    quota = QuotaManager()
    snapshots: list[dict[str, Any]] = []
    competitor_pages: list[dict[str, Any]] = []
    serpapi_used = 0
    cse_used = 0
    errors = 0

    print(f"  Queries to fetch: {len(queries)}")

    for query in queries:
        results: list[dict] = []
        source = "none"
        cached = False
        error_msg: str | None = None

        extras: dict[str, Any] = {}
        try:
            results, source, cached, extras, error_msg = _fetch_serp(query, quota)
            if source == "serpapi" and not cached:
                serpapi_used += 1
            if source == "google_cse" and not cached:
                cse_used += 1
        except Exception as exc:
            error_msg = str(exc)
            errors += 1

        jedmee_pos = _find_jedmee_position(results) if results else None
        snapshot = {
            "query": query,
            "location": "in",
            "captured_at": _utc_now(),
            "cached": cached,
            "source": source,
            "error": error_msg,
            "jedmee_position": jedmee_pos,
            "results": results,
            "people_also_ask": extras.get("people_also_ask", []),
            "related_searches": extras.get("related_searches", []),
            "answer_box": extras.get("answer_box"),
        }
        snapshots.append(snapshot)
        db.save_serp_snapshot(run_id, snapshot)

        status = "OK" if results else "SKIP"
        print(
            f"  [{status}] {query!r} jedmee=#{jedmee_pos or '—'} "
            f"results={len(results)} source={source}"
        )

        for row in results[:COMPETITOR_FETCH_TOP_N]:
            url = row.get("url")
            if not url:
                continue
            comp = _fetch_competitor_page(url, query, row.get("position") or 0)
            competitor_pages.append(comp)
            time.sleep(0.3)

    return {
        "available": True,
        "fetched_at": _utc_now(),
        "queries_fetched": len(queries),
        "snapshots": snapshots,
        "competitor_pages": competitor_pages,
        "quota_used": {
            "serpapi": serpapi_used,
            "google_cse": cse_used,
            "errors": errors,
        },
    }
