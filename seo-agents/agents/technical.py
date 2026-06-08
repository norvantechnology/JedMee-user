from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

import config


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class TechnicalAgent:
    name = "technical"

    def run(self, ctx: dict[str, Any], tasks: list) -> dict[str, Any]:
        findings: list[dict[str, Any]] = []
        fid = 0

        for page in ctx.get("pages", []):
            path = page.get("path", "/")
            spa = page.get("spa_risk_score") or 0

            if spa >= 0.5:
                fid += 1
                findings.append(
                    {
                        "finding_id": f"F{fid:03d}",
                        "category": "SPA_RENDERING",
                        "page": path,
                        "severity": 5 if spa >= 0.7 else 4,
                        "title": f"SPA rendering gap on {path}",
                        "detail": (
                            f"Raw title: {page.get('raw_title')!r}, "
                            f"rendered: {page.get('rendered_title')!r}. "
                            f"Raw words: {page.get('raw_word_count')}, "
                            f"rendered: {page.get('rendered_word_count')}."
                        ),
                        "evidence": {
                            "spa_risk_score": spa,
                            "spa_risk_flags": page.get("spa_risk_flags", []),
                        },
                        "recommended_fix": (
                            "Ensure prerender is deployed (npm run build). "
                            f"Verify: curl {config.SITE_URL}{path if path != '/' else '/'} returns page-specific <title>."
                        ),
                        "blocks_tasks": ["CONTENT", "ONPAGE"] if spa >= 0.7 else [],
                    }
                )

            if page.get("http_status") and page.get("http_status") != 200:
                fid += 1
                findings.append(
                    {
                        "finding_id": f"F{fid:03d}",
                        "category": "HTTP_STATUS",
                        "page": path,
                        "severity": 5,
                        "title": f"Non-200 status on {path}",
                        "detail": f"HTTP {page.get('http_status')}",
                        "recommended_fix": f"Fix server response for {path}",
                    }
                )

        pagespeed = ctx.get("pagespeed", {})
        for path, strategies in pagespeed.items():
            if not isinstance(strategies, dict):
                continue
            for strategy, data in strategies.items():
                if data.get("lcp_rating") == "poor":
                    fid += 1
                    findings.append(
                        {
                            "finding_id": f"F{fid:03d}",
                            "category": "CORE_WEB_VITALS",
                            "page": path,
                            "severity": 4,
                            "title": f"Poor LCP on {path} ({strategy})",
                            "detail": f"LCP {data.get('lcp_ms')}ms, score {data.get('performance_score')}",
                            "recommended_fix": "Optimize images, reduce JS bundle, improve LCP",
                        }
                    )

        sitemap = ctx.get("repo_parse", {}).get("sitemap", {})
        if sitemap.get("exists") and not sitemap.get("covers_all_public_pages"):
            fid += 1
            findings.append(
                {
                    "finding_id": f"F{fid:03d}",
                    "category": "SITEMAP",
                    "page": None,
                    "severity": 4,
                    "title": "Sitemap missing public URLs",
                    "detail": f"Missing: {sitemap.get('missing_public_paths')}",
                    "recommended_fix": "Add all public URLs to frontend/public/sitemap.xml",
                }
            )

        for issue in ctx.get("repo_parse", {}).get("issues", []):
            if "JSON_LD" in issue.get("code", ""):
                fid += 1
                findings.append(
                    {
                        "finding_id": f"F{fid:03d}",
                        "category": "SCHEMA",
                        "page": issue.get("code", "").replace("_MISSING_JSON_LD", "").replace("CONTACT", "/contact").lower(),
                        "severity": 3,
                        "title": issue.get("code", "Schema issue"),
                        "detail": issue.get("message", ""),
                        "recommended_fix": "Add useJsonLd() with appropriate schema.org type",
                    }
                )

        blocker_count = sum(1 for f in findings if f.get("severity", 0) >= 4)
        return {
            "run_id": ctx.get("run_id"),
            "generated_at": _utc_now(),
            "agent": self.name,
            "findings": findings,
            "summary": {
                "blocker_count": blocker_count,
                "warning_count": sum(1 for f in findings if f.get("severity") == 3),
                "info_count": sum(1 for f in findings if f.get("severity", 0) <= 2),
                "spa_risk_scores": {
                    p["path"]: p.get("spa_risk_score") for p in ctx.get("pages", [])
                },
            },
        }
