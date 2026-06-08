"""Notify Google Search Console after deploy — resubmit sitemap."""
from __future__ import annotations

from urllib.parse import quote

import requests

import config
from collectors.gsc_client import _build_service


def submit_sitemap() -> dict:
    """
    Resubmit sitemap via GSC API and ping Google.
    Returns status dict for logging.
    """
    site_url = config.GSC_PROPERTY_URL.rstrip("/") + "/"
    sitemap_url = f"{config.SITE_URL.rstrip('/')}/sitemap.xml"
    result: dict = {"sitemap_url": sitemap_url, "site_url": site_url}

    try:
        service = _build_service()
        service.sitemaps().submit(siteUrl=site_url, feedpath=sitemap_url).execute()
        result["gsc_api"] = "submitted"
    except Exception as exc:
        result["gsc_api"] = f"error: {exc}"

    # Optional legacy ping (Google may return 404; GSC API submit is primary)
    try:
        ping_url = f"https://www.google.com/ping?sitemap={quote(sitemap_url, safe='')}"
        resp = requests.get(ping_url, timeout=15)
        result["google_ping"] = f"http_{resp.status_code}"
    except Exception as exc:
        result["google_ping"] = f"skipped: {exc}"

    return result


def notify_indexing_updated_pages() -> dict:
    """Alias used by deploy pipeline after frontend goes live."""
    return submit_sitemap()
