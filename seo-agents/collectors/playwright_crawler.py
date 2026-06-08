"""
DataCollector Step 2 — Rendered DOM crawl (Playwright).

Visits each public URL in headless Chromium and captures what a browser
(and Google with rendering) would see after React mounts.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

import config
from collectors.html_extract import parse_html_snapshot

USER_AGENT = "JedMee-SEO-DataCollector/1.0 (+https://jedmee.com)"


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _url_for_path(path: str) -> str:
    return f"{config.SITE_URL}/" if path == "/" else f"{config.SITE_URL}{path}"


def render_all_public_pages() -> list[dict[str, Any]]:
    """Render all PUBLIC_PATHS with Playwright and return snapshot dicts."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise RuntimeError(
            "Playwright is not installed. Run: pip install playwright && playwright install chromium"
        ) from exc

    results: list[dict[str, Any]] = []

    with sync_playwright() as pw:
        try:
            browser = pw.chromium.launch(headless=True)
        except Exception as exc:
            raise RuntimeError(
                "Chromium not found. Run: playwright install chromium"
            ) from exc

        page = browser.new_page(user_agent=USER_AGENT)

        for path in config.PUBLIC_PATHS:
            url = _url_for_path(path)
            render_error = None
            rendered_html = ""

            try:
                page.goto(url, wait_until="networkidle", timeout=60000)
                page.wait_for_timeout(1500)
                rendered_html = page.content()
            except Exception as exc:
                render_error = str(exc)
                try:
                    rendered_html = page.content()
                except Exception:
                    rendered_html = ""

            parsed = parse_html_snapshot(rendered_html) if rendered_html else {}

            snapshot = {
                "path": path,
                "url": url,
                "captured_at": _utc_now(),
                "render_error": render_error,
                "rendered_html": rendered_html or None,
                "rendered_title": parsed.get("title"),
                "rendered_meta_desc": parsed.get("meta_desc"),
                "rendered_schema_ld_json": (
                    json.dumps(parsed["schema_blocks"])
                    if parsed.get("schema_blocks")
                    else None
                ),
                "h1": parsed.get("h1"),
                "h2s": parsed.get("h2s", []),
                "h3s": parsed.get("h3s", []),
                "rendered_word_count": parsed.get("word_count", 0),
                "rendered_schema_types": parsed.get("schema_types", []),
                "rendered_schema_count": parsed.get("schema_count", 0),
            }
            results.append(snapshot)

            status = "ERR" if render_error else "OK"
            print(
                f"  [{status}] {path} "
                f"title={snapshot['rendered_title']!r} "
                f"words={snapshot['rendered_word_count']} "
                f"h2s={len(snapshot['h2s'])}"
            )
            if render_error:
                print(f"         render warning: {render_error}")

        browser.close()

    return results
