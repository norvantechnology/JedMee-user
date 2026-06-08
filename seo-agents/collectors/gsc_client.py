"""
DataCollector Step 5 — Google Search Console API.

Pulls impressions, clicks, CTR, position by page and top queries (90 days).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import config
from tools.quota_manager import QuotaManager

# Full scope: read Search Analytics + submit sitemaps after deploy
GSC_SCOPES = ["https://www.googleapis.com/auth/webmasters"]


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _date_range(days: int = 90) -> tuple[str, str]:
    end = datetime.now(timezone.utc).date()
    start = end - timedelta(days=days)
    return start.isoformat(), end.isoformat()


def _resolve_config_path(raw: str) -> Path | None:
    raw = (raw or "").strip()
    if not raw:
        return None
    path = Path(raw)
    if not path.is_absolute():
        path = config.PACKAGE_ROOT / path
    return path if path.exists() else None


def _resolve_gsc_credentials_path() -> Path | None:
    return _resolve_config_path(config.GSC_SERVICE_ACCOUNT_JSON)


def _resolve_oauth_client_path() -> Path | None:
    return _resolve_config_path(config.GSC_OAUTH_CLIENT_JSON)


def _resolve_oauth_token_path() -> Path | None:
    return _resolve_config_path(config.GSC_OAUTH_TOKEN_JSON)


def _oauth_credentials():
    """Load and refresh OAuth user credentials (personal Gmail)."""
    token_path = _resolve_oauth_token_path()
    if not token_path:
        return None

    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials

    creds = Credentials.from_authorized_user_file(str(token_path), GSC_SCOPES)
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        _save_oauth_token(creds, token_path)
    return creds


def _save_oauth_token(creds, token_path: Path | None = None) -> Path:
    token_path = token_path or _resolve_oauth_token_path()
    if token_path is None:
        raw = config.GSC_OAUTH_TOKEN_JSON.strip() or "./secrets/gsc-oauth-token.json"
        token_path = Path(raw)
        if not token_path.is_absolute():
            token_path = config.PACKAGE_ROOT / token_path
    token_path.parent.mkdir(parents=True, exist_ok=True)
    token_path.write_text(creds.to_json(), encoding="utf-8")
    return token_path


def _service_account_credentials():
    from google.oauth2 import service_account

    cred_path = _resolve_gsc_credentials_path()
    if not cred_path:
        return None
    return service_account.Credentials.from_service_account_file(
        str(cred_path),
        scopes=GSC_SCOPES,
    )


def _gsc_auth_configured() -> bool:
    mode = config.GSC_AUTH_MODE
    if mode == "oauth":
        return _resolve_oauth_client_path() is not None and _resolve_oauth_token_path() is not None
    if mode == "service_account":
        return _resolve_gsc_credentials_path() is not None
    # auto
    oauth_ready = _resolve_oauth_client_path() and _resolve_oauth_token_path()
    return bool(oauth_ready or _resolve_gsc_credentials_path())


def _build_service():
    from googleapiclient.discovery import build

    mode = config.GSC_AUTH_MODE
    credentials = None
    auth_used = ""

    if mode == "oauth":
        credentials = _oauth_credentials()
        auth_used = "oauth"
        if not credentials:
            raise FileNotFoundError(
                "GSC OAuth token missing — run: python scripts/authorize_gsc_oauth.py"
            )
    elif mode == "service_account":
        credentials = _service_account_credentials()
        auth_used = "service_account"
        if not credentials:
            raise FileNotFoundError("GSC service account JSON not found")
    else:
        # auto: prefer OAuth (works when service account can't be added to GSC UI)
        credentials = _oauth_credentials()
        if credentials:
            auth_used = "oauth"
        else:
            credentials = _service_account_credentials()
            auth_used = "service_account"
        if not credentials:
            raise FileNotFoundError(
                "No GSC credentials — set up OAuth (authorize_gsc_oauth.py) "
                "or service account JSON"
            )

    service = build("searchconsole", "v1", credentials=credentials, cache_discovery=False)
    service._gsc_auth_mode = auth_used  # noqa: SLF001 — for logging
    return service


def _page_filter(page_url: str) -> dict:
    return {
        "filters": [
            {
                "dimension": "page",
                "operator": "equals",
                "expression": page_url,
            }
        ]
    }


def _query_search_analytics(
    service,
    site_url: str,
    start_date: str,
    end_date: str,
    dimensions: list[str],
    row_limit: int = 25,
    dimension_filter_groups: list | None = None,
) -> list[dict]:
    body: dict[str, Any] = {
        "startDate": start_date,
        "endDate": end_date,
        "dimensions": dimensions,
        "rowLimit": row_limit,
        "dataState": "final",
    }
    if dimension_filter_groups:
        body["dimensionFilterGroups"] = dimension_filter_groups

    response = (
        service.searchanalytics()
        .query(siteUrl=site_url, body=body)
        .execute()
    )
    return response.get("rows", [])


def _normalize_page_key(page_url: str) -> str | None:
    page_url = page_url.rstrip("/")
    site = config.SITE_URL.rstrip("/")
    if page_url == site or page_url == f"{site}/":
        return "/"
    for path in config.PUBLIC_PATHS:
        if path == "/":
            continue
        if page_url.endswith(path):
            return path
    return None


def fetch_gsc_data() -> dict[str, Any]:
    """Fetch GSC metrics for public pages."""
    if not _gsc_auth_configured():
        print("  ⚠ GSC skipped — no credentials (OAuth token or service account JSON)")
        return {
            "available": False,
            "reason": "missing_credentials",
            "by_page": {},
            "queries": [],
        }

    quota = QuotaManager()
    cache_key = f"gsc|{config.SITE_URL}|90d"
    cached = quota.get_cached("gsc", cache_key)
    if cached:
        print(f"  Using GSC cache ({cached['age_hours']}h old)")
        result = cached["data"]
        result["cached"] = True
        return result

    gate = quota.check_and_consume("gsc")
    if gate not in (True,):
        stale = quota.get_cached("gsc", cache_key)
        if stale:
            result = stale["data"]
            result["cached"] = True
            result["stale_cache"] = True
            return result
        print("  ⚠ GSC skipped — quota exhausted")
        return {"available": False, "reason": "quota_exhausted", "by_page": {}, "queries": []}

    start_date, end_date = _date_range(90)
    site_url = config.GSC_PROPERTY_URL
    if not site_url.endswith("/"):
        site_url = f"{site_url}/"

    try:
        service = _build_service()
        auth_mode = getattr(service, "_gsc_auth_mode", config.GSC_AUTH_MODE)
        print(f"  GSC auth: {auth_mode}")
    except Exception as exc:
        print(f"  ⚠ GSC auth failed: {exc}")
        return {"available": False, "reason": str(exc), "by_page": {}, "queries": []}

    by_page: dict[str, Any] = {}
    all_queries: list[dict[str, Any]] = []

    for path in config.PUBLIC_PATHS:
        page_url = f"{config.SITE_URL}/" if path == "/" else f"{config.SITE_URL}{path}"

        page_rows = _query_search_analytics(
            service,
            site_url,
            start_date,
            end_date,
            dimensions=["page"],
            row_limit=1,
            dimension_filter_groups=[_page_filter(page_url)],
        )

        impressions = clicks = 0
        ctr = position = 0.0
        if page_rows:
            keys = page_rows[0].get("keys", [])
            if keys and _normalize_page_key(keys[0]) == path:
                row = page_rows[0]
                impressions = int(row.get("impressions", 0))
                clicks = int(row.get("clicks", 0))
                ctr = float(row.get("ctr", 0))
                position = float(row.get("position", 0))

        query_rows = _query_search_analytics(
            service,
            site_url,
            start_date,
            end_date,
            dimensions=["query", "page"],
            row_limit=20,
            dimension_filter_groups=[_page_filter(page_url)],
        )

        top_queries: list[dict[str, Any]] = []
        for row in query_rows:
            keys = row.get("keys", [])
            if len(keys) < 2:
                continue
            query_text, row_page = keys[0], keys[1]
            if _normalize_page_key(row_page) != path:
                continue
            entry = {
                "query": query_text,
                "page": path,
                "impressions": int(row.get("impressions", 0)),
                "clicks": int(row.get("clicks", 0)),
                "ctr": round(float(row.get("ctr", 0)), 4),
                "position": round(float(row.get("position", 0)), 1),
            }
            top_queries.append(entry)
            all_queries.append(entry)

        top_queries.sort(key=lambda q: q["impressions"], reverse=True)

        anomalies = []
        if impressions > 100 and ctr < 0.02:
            anomalies.append("low_ctr")
        if 11 <= position <= 20:
            anomalies.append("near_page_2")
        if impressions > 100 and clicks == 0:
            anomalies.append("zero_clicks")

        by_page[path] = {
            "page_url": page_url,
            "impressions": impressions,
            "clicks": clicks,
            "ctr": round(ctr, 4),
            "avg_position": round(position, 1),
            "top_queries": top_queries[:20],
            "anomalies": anomalies,
        }
        print(
            f"  [{path}] impressions={impressions} clicks={clicks} "
            f"pos={position:.1f} queries={len(top_queries)}"
        )

    all_queries.sort(key=lambda q: q["impressions"], reverse=True)

    result = {
        "available": True,
        "cached": False,
        "period": "last_90_days",
        "start_date": start_date,
        "end_date": end_date,
        "fetched_at": _utc_now(),
        "by_page": by_page,
        "queries": all_queries,
    }
    quota.set_cache("gsc", cache_key, result)
    return result
