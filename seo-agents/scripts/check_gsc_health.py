#!/usr/bin/env python3
"""Lightweight GSC credential + property access check."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import config
from collectors.gsc_client import _build_service, _date_range, _gsc_auth_configured


def main() -> int:
    if not _gsc_auth_configured():
        print("FAIL: GSC credentials not configured")
        return 1

    try:
        service = _build_service()
        prop = config.GSC_PROPERTY_URL
        start, end = _date_range(3)
        body = {"startDate": start, "endDate": end, "dimensions": ["page"], "rowLimit": 1}
        service.searchanalytics().query(siteUrl=prop, body=body).execute()
        print(f"OK: GSC healthy for {prop}")
        return 0
    except Exception as exc:
        print(f"FAIL: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
