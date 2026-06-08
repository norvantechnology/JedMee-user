"""API quota gates and response caching."""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any

import config
from tools import db


class QuotaManager:
    LIMITS: dict[str, dict[str, int]] = {
        "psi": {"daily": 25000},
        "gsc": {"daily": 2000},
        "serpapi": {
            "daily": config.SERPAPI_DAILY_CAP,
            "monthly": config.SERPAPI_MONTHLY_CAP,
        },
        "google_cse": {"daily": config.GOOGLE_CSE_DAILY_CAP},
    }

    CACHE_TTL_HOURS: dict[str, int] = {
        "psi": config.PSI_CACHE_TTL_HOURS,
        "serpapi": 12,
        "google_cse": 12,
        "gsc": 24,
    }

    def _period_keys(self) -> dict[str, str]:
        now = datetime.now(timezone.utc)
        return {
            "daily": now.strftime("%Y-%m-%d"),
            "monthly": now.strftime("%Y-%m"),
        }

    def get_cached(self, api: str, cache_key: str) -> dict[str, Any] | None:
        row = db.get_api_cache(api, cache_key)
        if not row:
            return None

        cached_at = datetime.fromisoformat(row["cached_at"])
        ttl = self.CACHE_TTL_HOURS.get(api, 6)
        if datetime.now(timezone.utc) - cached_at > timedelta(hours=ttl):
            return None

        return {
            "data": json.loads(row["response_json"]),
            "cached_at": row["cached_at"],
            "age_hours": round(
                (datetime.now(timezone.utc) - cached_at).total_seconds() / 3600, 1
            ),
        }

    def set_cache(self, api: str, cache_key: str, data: dict[str, Any]) -> None:
        db.set_api_cache(api, cache_key, json.dumps(data))

    def check_and_consume(self, api: str, count: int = 1) -> bool | str:
        """
        Returns True if quota available.
        Returns 'CACHED' if caller should use cache (quota exhausted but cache may exist).
        Returns False if exhausted and no cache path.
        """
        limits = self.LIMITS.get(api, {})
        periods = self._period_keys()

        for period_name, period_key in periods.items():
            cap = limits.get(period_name)
            if cap is None:
                continue
            used = db.get_quota_count(api, period_name, period_key)
            if used + count > cap:
                return "CACHED"

        for period_name, period_key in periods.items():
            if period_name in limits:
                db.increment_quota(api, period_name, period_key, count)

        return True

    def peek(self, api: str, count: int = 1) -> bool:
        """Check quota without consuming."""
        limits = self.LIMITS.get(api, {})
        periods = self._period_keys()
        for period_name, period_key in periods.items():
            cap = limits.get(period_name)
            if cap is None:
                continue
            if db.get_quota_count(api, period_name, period_key) + count > cap:
                return False
        return True
