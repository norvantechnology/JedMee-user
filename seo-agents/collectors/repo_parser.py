"""
DataCollector Step 3 — Repo parse.

Reads JSX source and public files from the monorepo to compare intended SEO
config vs what the live site shows.
"""
from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

import config


def _read_text(path: Path) -> str:
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8")


def _extract_braced_block(source: str, start_marker: str) -> str | None:
    """Extract `{ ... }` block after start_marker using brace counting."""
    idx = source.find(start_marker)
    if idx < 0:
        return None
    brace_start = source.find("{", idx)
    if brace_start < 0:
        return None

    depth = 0
    for i in range(brace_start, len(source)):
        ch = source[i]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return source[brace_start : i + 1]
    return None


def _extract_string_field(block: str, field: str) -> str | None:
    """Extract a simple string field: field: \"value\" or field: 'value'."""
    pattern = rf'{field}\s*:\s*["\']([^"\']+)["\']'
    match = re.search(pattern, block)
    return match.group(1).strip() if match else None


def _extract_use_seo_meta(source: str) -> dict[str, str | None]:
    block = _extract_braced_block(source, "useSeoMeta(")
    if not block:
        return {"title": None, "description": None, "keywords": None, "canonical": None}

    title = _extract_string_field(block, "title")
    description = _extract_string_field(block, "description")
    keywords = _extract_string_field(block, "keywords")
    canonical = _extract_string_field(block, "canonical")

    # Landing page uses template: canonical: `${SEO_CONFIG.siteUrl}/`
    if not canonical:
        canon_match = re.search(r"canonical:\s*`([^`]+)`", block)
        if canon_match:
            canonical = canon_match.group(1).replace("${SEO_CONFIG.siteUrl}", "https://jedmee.com")

    return {
        "title": title,
        "description": description,
        "keywords": keywords,
        "canonical": canonical,
    }


def _parse_landing_seo_config(source: str) -> dict[str, Any]:
    block = _extract_braced_block(source, "const SEO_CONFIG =")
    if not block:
        return {}

    faq_count = len(re.findall(r"\bq:\s*[\"']", block))
    plan_count = len(re.findall(r"name:\s*[\"']", block[block.find("plans:") :] if "plans:" in block else ""))

    return {
        "site_name": _extract_string_field(block, "siteName"),
        "site_url": _extract_string_field(block, "siteUrl"),
        "support_email": _extract_string_field(block, "supportEmail"),
        "faq_count": faq_count,
        "plan_count": plan_count,
        "use_seo_meta": _extract_use_seo_meta(source),
        "has_json_ld": "useJsonLd" in source,
    }


def _parse_page_file(path: Path, path_key: str) -> dict[str, Any]:
    source = _read_text(path)
    seo_meta = _extract_use_seo_meta(source)
    return {
        "path": path_key,
        "file": str(path.relative_to(config.REPO_ROOT)),
        "exists": path.exists(),
        "use_seo_meta": seo_meta,
        "has_use_seo_meta": "useSeoMeta" in source,
        "has_json_ld": "useJsonLd" in source,
        "title_length": len(seo_meta["title"] or ""),
        "description_length": len(seo_meta["description"] or ""),
    }


def _parse_sitemap() -> dict[str, Any]:
    path = config.FRONTEND_PUBLIC_DIR / "sitemap.xml"
    text = _read_text(path)
    if not text:
        return {"exists": False, "urls": [], "missing_public_paths": config.PUBLIC_PATHS}

    root = ET.fromstring(text)
    ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    urls: list[dict[str, str]] = []

    for url_el in root.findall("sm:url", ns):
        loc = url_el.findtext("sm:loc", default="", namespaces=ns)
        lastmod = url_el.findtext("sm:lastmod", default="", namespaces=ns)
        priority = url_el.findtext("sm:priority", default="", namespaces=ns)
        if loc:
            urls.append({"loc": loc.strip(), "lastmod": lastmod, "priority": priority})

    found_paths = set()
    for entry in urls:
        loc = entry["loc"].rstrip("/")
        if loc == config.SITE_URL.rstrip("/"):
            found_paths.add("/")
        else:
            found_paths.add(loc.replace(config.SITE_URL.rstrip("/"), ""))

    missing = [p for p in config.PUBLIC_PATHS if p not in found_paths]

    return {
        "exists": True,
        "file": str(path.relative_to(config.REPO_ROOT)),
        "urls": urls,
        "url_count": len(urls),
        "missing_public_paths": missing,
        "covers_all_public_pages": len(missing) == 0,
    }


def _parse_robots_txt() -> dict[str, Any]:
    path = config.FRONTEND_PUBLIC_DIR / "robots.txt"
    text = _read_text(path)
    if not text:
        return {"exists": False}

    allow_rules = re.findall(r"^Allow:\s*(.+)$", text, re.MULTILINE)
    disallow_rules = re.findall(r"^Disallow:\s*(.+)$", text, re.MULTILINE)
    sitemap_lines = re.findall(r"^Sitemap:\s*(.+)$", text, re.MULTILINE)

    public_allowed = all(
        any(rule.strip() in (p, f"{p}/", "/") for rule in allow_rules)
        for p in ["/", "/about", "/contact", "/terms"]
    )

    return {
        "exists": True,
        "file": str(path.relative_to(config.REPO_ROOT)),
        "allow_rules": allow_rules[:20],
        "disallow_count": len(disallow_rules),
        "sitemaps": sitemap_lines,
        "blocks_dashboard": any("/dashboard" in r for r in disallow_rules),
        "public_pages_allowed": public_allowed,
    }


def _parse_llms_txt() -> dict[str, Any]:
    path = config.FRONTEND_PUBLIC_DIR / "llms.txt"
    text = _read_text(path)
    if not text:
        return {"exists": False}

    return {
        "exists": True,
        "file": str(path.relative_to(config.REPO_ROOT)),
        "line_count": len(text.splitlines()),
        "char_count": len(text),
        "preview": text[:400].strip(),
        "mentions_jedmee": "jedmee" in text.lower(),
    }


def parse_repo() -> dict[str, Any]:
    """Parse all repo SEO sources and return repo_parse section for run_context."""
    landing_path = config.FRONTEND_PAGES["/"]
    landing_source = _read_text(landing_path)

    pages: dict[str, Any] = {
        "/": {
            **_parse_page_file(landing_path, "/"),
            "seo_config": _parse_landing_seo_config(landing_source),
        },
    }

    for path_key in ("/about", "/contact", "/terms"):
        file_path = config.FRONTEND_PAGES[path_key]
        pages[path_key] = _parse_page_file(file_path, path_key)

    sitemap = _parse_sitemap()
    robots = _parse_robots_txt()
    llms = _parse_llms_txt()

    issues: list[dict[str, str]] = []
    if not pages["/contact"]["has_json_ld"]:
        issues.append({
            "severity": "medium",
            "code": "CONTACT_MISSING_JSON_LD",
            "message": "ContactPage.jsx has useSeoMeta but no useJsonLd (ContactPage schema)",
        })
    if not pages["/terms"]["has_json_ld"]:
        issues.append({
            "severity": "low",
            "code": "TERMS_MISSING_JSON_LD",
            "message": "TermsPage.jsx has no useJsonLd schema",
        })
    if sitemap.get("exists") and not sitemap.get("covers_all_public_pages"):
        issues.append({
            "severity": "high",
            "code": "SITEMAP_MISSING_URLS",
            "message": f"sitemap.xml missing paths: {sitemap.get('missing_public_paths')}",
        })

    print(f"  Landing FAQ count: {pages['/']['seo_config'].get('faq_count', 0)}")
    print(f"  Sitemap URLs: {sitemap.get('url_count', 0)}")
    print(f"  Repo issues found: {len(issues)}")
    for issue in issues:
        print(f"    [{issue['severity']}] {issue['code']}: {issue['message']}")

    return {
        "pages": pages,
        "sitemap": sitemap,
        "robots_txt": robots,
        "llms_txt": llms,
        "issues": issues,
    }
