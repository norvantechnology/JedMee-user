#!/usr/bin/env python3
"""Resubmit sitemap to Google Search Console after deploy."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tools.gsc_indexing import notify_indexing_updated_pages


def main() -> int:
    result = notify_indexing_updated_pages()
    print("GSC indexing notification:")
    for key, value in result.items():
        print(f"  {key}: {value}")
    gsc = str(result.get("gsc_api", ""))
    if gsc == "submitted":
        return 0
    if "insufficient authentication scopes" in gsc.lower():
        print("\nRe-authorize with sitemap scope:")
        print("  python scripts/authorize_gsc_oauth.py")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
