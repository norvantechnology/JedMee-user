"""
DataCollector Step 1 — Raw HTTP crawl.

Fetches each public URL without JavaScript and extracts what a basic
crawler would see: title, meta description, canonical, JSON-LD, noindex.
"""
from __future__ import annotations

import json
import re
import time
from datetime import datetime, timezone
from typing import Any

import requests
from bs4 import BeautifulSoup

import config

USER_AGENT = "JedMee-SEO-DataCollector/1.0 (+https://jedmee.com)"


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _extract_json_ld(soup: BeautifulSoup) -> list[dict]:
    blocks: list[dict] = []
    for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
        text = script.string or script.get_text()
        if not text or not text.strip():
            continue
        try:
            parsed = json.loads(text)
            if isinstance(parsed, list):
                blocks.extend(parsed)
            else:
                blocks.append(parsed)
        except json.JSONDecodeError:
            continue
    return blocks


def _has_noindex(soup: BeautifulSoup) -> bool:
    for meta in soup.find_all("meta", attrs={"name": re.compile(r"robots", re.I)}):
        content = (meta.get("content") or "").lower()
        if "noindex" in content:
            return True
    return False


def _extract_canonical(soup: BeautifulSoup) -> str | None:
    link = soup.find("link", rel=lambda v: v and "canonical" in v.lower())
    return link.get("href") if link else None


def crawl_url(path: str, session: requests.Session | None = None) -> dict[str, Any]:
    """Fetch one public path and return a page snapshot dict."""
    if path == "/":
        url = f"{config.SITE_URL}/"
    else:
        url = f"{config.SITE_URL}{path}"

    sess = session or requests.Session()
    start = time.perf_counter()
    resp = sess.get(
        url,
        headers={"User-Agent": USER_AGENT},
        timeout=30,
        allow_redirects=True,
    )
    elapsed_ms = int((time.perf_counter() - start) * 1000)

    soup = BeautifulSoup(resp.text, "html.parser")
    title_tag = soup.find("title")
    meta_desc_tag = soup.find("meta", attrs={"name": re.compile(r"^description$", re.I)})

    raw_title = title_tag.get_text(strip=True) if title_tag else None
    raw_meta_desc = meta_desc_tag.get("content", "").strip() if meta_desc_tag else None
    schema_blocks = _extract_json_ld(soup)

    return {
        "path": path,
        "url": url,
        "captured_at": _utc_now(),
        "http_status": resp.status_code,
        "response_time_ms": elapsed_ms,
        "raw_html": resp.text,
        "raw_title": raw_title,
        "raw_meta_desc": raw_meta_desc,
        "raw_schema_ld_json": json.dumps(schema_blocks) if schema_blocks else None,
        "canonical_url": _extract_canonical(soup),
        "has_noindex": _has_noindex(soup),
        "schema_count": len(schema_blocks),
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
            f"({snapshot['response_time_ms']}ms)"
        )

    return results
