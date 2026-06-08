"""Shared HTML extraction helpers for raw and rendered crawls."""
from __future__ import annotations

import json
import re
from typing import Any

from bs4 import BeautifulSoup


def extract_json_ld(soup: BeautifulSoup) -> list[dict]:
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


def has_noindex(soup: BeautifulSoup) -> bool:
    for meta in soup.find_all("meta", attrs={"name": re.compile(r"robots", re.I)}):
        content = (meta.get("content") or "").lower()
        if "noindex" in content:
            return True
    return False


def extract_canonical(soup: BeautifulSoup) -> str | None:
    link = soup.find("link", rel=lambda v: v and "canonical" in str(v).lower())
    return link.get("href") if link else None


def extract_headings(soup: BeautifulSoup) -> dict[str, list[str]]:
    h1 = soup.find("h1")
    return {
        "h1": h1.get_text(strip=True) if h1 else None,
        "h2s": [t.get_text(strip=True) for t in soup.find_all("h2") if t.get_text(strip=True)],
        "h3s": [t.get_text(strip=True) for t in soup.find_all("h3") if t.get_text(strip=True)],
        "h4s": [t.get_text(strip=True) for t in soup.find_all("h4") if t.get_text(strip=True)],
        "h5s": [t.get_text(strip=True) for t in soup.find_all("h5") if t.get_text(strip=True)],
        "h6s": [t.get_text(strip=True) for t in soup.find_all("h6") if t.get_text(strip=True)],
    }


def extract_heading_hierarchy(soup: BeautifulSoup) -> list[dict[str, Any]]:
    """Full H1–H6 outline in document order."""
    hierarchy: list[dict[str, Any]] = []
    for tag in soup.find_all(re.compile(r"^h[1-6]$", re.I)):
        level = int(tag.name[1])
        text = tag.get_text(strip=True)
        if text:
            hierarchy.append({"level": level, "text": text})
    return hierarchy


def visible_word_count(soup: BeautifulSoup) -> int:
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    text = soup.get_text(separator=" ", strip=True)
    return len(text.split()) if text else 0


def parse_html_snapshot(html: str) -> dict[str, Any]:
    """Parse HTML into SEO-relevant fields."""
    soup = BeautifulSoup(html, "html.parser")
    title_tag = soup.find("title")
    meta_desc_tag = soup.find("meta", attrs={"name": re.compile(r"^description$", re.I)})
    schema_blocks = extract_json_ld(soup)
    headings = extract_headings(soup)

    return {
        "title": title_tag.get_text(strip=True) if title_tag else None,
        "meta_desc": meta_desc_tag.get("content", "").strip() if meta_desc_tag else None,
        "canonical_url": extract_canonical(soup),
        "has_noindex": has_noindex(soup),
        "schema_blocks": schema_blocks,
        "schema_count": len(schema_blocks),
        "schema_types": sorted(
            {b.get("@type") for b in schema_blocks if isinstance(b, dict) and b.get("@type")}
        ),
        "word_count": visible_word_count(soup),
        "heading_hierarchy": extract_heading_hierarchy(soup),
        **headings,
    }
