"""
DataCollector Step 1 — Raw HTTP crawl.

Fetches each public URL without JavaScript and extracts what a basic
crawler would see: title, meta description, canonical, JSON-LD, noindex.
"""
from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from typing import Any

import requests
from bs4 import BeautifulSoup

import config
from collectors.html_extract import parse_html_snapshot

USER_AGENT = "JedMee-SEO-DataCollector/1.0 (+https://jedmee.com)"


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def crawl_url(path: str, session: requests.Session | None = None) -> dict[str, Any]:
    """Fetch one public path and return a page snapshot dict."""
    url = f"{config.SITE_URL}/" if path == "/" else f"{config.SITE_URL}{path}"

    sess = session or requests.Session()
    start = time.perf_counter()
    resp = sess.get(
        url,
        headers={"User-Agent": USER_AGENT},
        timeout=30,
        allow_redirects=True,
    )
    elapsed_ms = int((time.perf_counter() - start) * 1000)

    parsed = parse_html_snapshot(resp.text)
    schema_blocks = parsed.get("schema_blocks") or []

    return {
        "path": path,
        "url": url,
        "captured_at": _utc_now(),
        "http_status": resp.status_code,
        "response_time_ms": elapsed_ms,
        "raw_html": resp.text,
        "raw_title": parsed.get("title"),
        "raw_meta_desc": parsed.get("meta_desc"),
        "raw_schema_ld_json": json.dumps(schema_blocks) if schema_blocks else None,
        "canonical_url": parsed.get("canonical_url"),
        "has_noindex": parsed.get("has_noindex", False),
        "schema_count": parsed.get("schema_count", 0),
        "raw_word_count": parsed.get("word_count", 0),
        "raw_schema_types": parsed.get("schema_types", []),
    }


def crawl_all_public_pages() -> list[dict[str, Any]]:
    """Crawl all PUBLIC_PATHS and return snapshot list."""
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})
    results: list[dict[str, Any]] = []

    for path in config.PUBLIC_PATHS:
        snapshot = crawl_url(path, session=session)
        results.append(snapshot)
        print(
            f"  [{snapshot['http_status']}] {path} "
            f"title={snapshot['raw_title']!r} "
            f"words={snapshot['raw_word_count']} "
            f"({snapshot['response_time_ms']}ms)"
        )

    return results
