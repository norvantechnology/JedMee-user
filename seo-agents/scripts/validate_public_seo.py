#!/usr/bin/env python3
"""CI SEO validation — 8 static checks from Part E.3."""
from __future__ import annotations

import argparse
import re
import sys
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import config


@dataclass
class Check:
    name: str
    passed: bool
    detail: str = ""


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8") if path.exists() else ""


def check_sitemap_urls() -> Check:
    path = config.FRONTEND_PUBLIC_DIR / "sitemap.xml"
    if not path.exists():
        return Check("sitemap_exists", False, "sitemap.xml missing")
    root = ET.parse(path).getroot()
    ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    locs = [e.text for e in root.findall(".//sm:loc", ns)] or [
        e.text for e in root.findall(".//loc")
    ]
    missing = [u for u in config.PUBLIC_URLS if u not in locs]
    return Check(
        "sitemap_all_public_urls",
        len(missing) == 0,
        f"missing: {missing}" if missing else f"{len(locs)} URLs",
    )


def check_no_noindex_in_jsx() -> Check:
    bad: list[str] = []
    for path in config.FRONTEND_PAGES.values():
        src = _read(path)
        if re.search(r'noindex\s*:\s*true', src, re.I):
            bad.append(path.name)
    return Check("no_noindex_in_jsx", not bad, ", ".join(bad) or "ok")


def check_landing_seo_meta() -> list[Check]:
    src = _read(config.FRONTEND_PAGES["/"])
    block = re.search(r"useSeoMeta\(\{([\s\S]*?)\}\);", src)
    if not block:
        return [Check("landing_use_seo_meta", False, "useSeoMeta not found")]

    inner = block.group(1)
    title_m = re.search(r'title:\s*["\']([^"\']+)["\']', inner)
    desc_m = re.search(r'description:\s*["\']([^"\']+)["\']', inner) or re.search(
        r"description:\s*\n\s*[\"']([^\"']+)[\"']", inner
    )
    title = title_m.group(1) if title_m else ""
    desc = desc_m.group(1) if desc_m else ""

    return [
        Check(
            "landing_title_length",
            30 <= len(title) <= 70,
            f"{len(title)} chars: {title[:50]}",
        ),
        Check(
            "landing_description_length",
            100 <= len(desc) <= 200,
            f"{len(desc)} chars",
        ),
        Check("landing_use_seo_meta", "useSeoMeta(" in src, "ok"),
    ]


def check_use_seo_meta() -> Check:
    missing = []
    for path in [
        config.FRONTEND_PAGES["/about"],
        config.FRONTEND_PAGES["/contact"],
        config.FRONTEND_PAGES["/terms"],
    ]:
        if "useSeoMeta(" not in _read(path):
            missing.append(path.name)
    return Check("subpages_use_seo_meta", not missing, ", ".join(missing) or "ok")


def check_use_json_ld() -> Check:
    missing = []
    for name, path in [("ContactPage", config.FRONTEND_PAGES["/contact"]),
                         ("TermsPage", config.FRONTEND_PAGES["/terms"])]:
        if "useJsonLd(" not in _read(path):
            missing.append(name)
    return Check("contact_terms_use_json_ld", not missing, ", ".join(missing) or "ok")


def check_prerender_titles(dist_dir: Path) -> list[Check]:
    checks: list[Check] = []
    pages = {
        "index.html": config.FRONTEND_PAGES["/"],
        "about/index.html": config.FRONTEND_PAGES["/about"],
        "contact/index.html": config.FRONTEND_PAGES["/contact"],
        "terms/index.html": config.FRONTEND_PAGES["/terms"],
    }
    for rel, _ in pages.items():
        f = dist_dir / rel
        if not f.exists():
            checks.append(Check(f"dist_{rel}", False, "file missing"))
            continue
        html = _read(f)
        has_title = "<title>" in html and "</title>" in html
        checks.append(Check(f"dist_title_{rel}", has_title, "ok" if has_title else "no title"))
    return checks


def validate_static() -> list[Check]:
    checks = [
        check_sitemap_urls(),
        check_no_noindex_in_jsx(),
        *check_landing_seo_meta(),
        check_use_seo_meta(),
        check_use_json_ld(),
    ]
    return checks


def validate_live(dist_dir: Path) -> list[Check]:
    return check_prerender_titles(dist_dir)


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate public SEO")
    parser.add_argument("--mode", choices=["static", "live", "all"], default="all")
    parser.add_argument("--dist-dir", default=str(config.REPO_ROOT / "frontend/dist"))
    args = parser.parse_args()

    checks: list[Check] = []
    if args.mode in ("static", "all"):
        checks.extend(validate_static())
    if args.mode in ("live", "all"):
        checks.extend(validate_live(Path(args.dist_dir)))

    failed = [c for c in checks if not c.passed]
    for c in checks:
        mark = "✓" if c.passed else "✗"
        print(f"  {mark} {c.name}: {c.detail}")

    if failed:
        print(f"\nSEO VALIDATION FAILED ({len(failed)} checks)")
        return 1
    print(f"\nAll {len(checks)} SEO checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
