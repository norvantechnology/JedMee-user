"""Central configuration for the JedMee SEO agents package."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

PACKAGE_ROOT = Path(__file__).resolve().parent
load_dotenv(PACKAGE_ROOT / ".env")

# Monorepo root (parent of seo-agents/)
REPO_ROOT = Path(os.getenv("SEO_REPO_ROOT", PACKAGE_ROOT.parent)).resolve()

SITE_URL = os.getenv("SEO_SITE_URL", "https://jedmee.com").rstrip("/")

PUBLIC_PATHS: list[str] = ["/", "/about", "/contact", "/terms"]

PUBLIC_URLS: list[str] = [f"{SITE_URL}{p}" if p != "/" else f"{SITE_URL}/" for p in PUBLIC_PATHS]

# Frontend files the repo parser and apply step will touch
FRONTEND_PAGES = {
    "/": REPO_ROOT / "frontend/src/pages/LandingPage.jsx",
    "/about": REPO_ROOT / "frontend/src/pages/AboutPage.jsx",
    "/contact": REPO_ROOT / "frontend/src/pages/ContactPage.jsx",
    "/terms": REPO_ROOT / "frontend/src/pages/TermsPage.jsx",
}

FRONTEND_PUBLIC_DIR = REPO_ROOT / "frontend/public"
FRONTEND_SEO_UTIL = REPO_ROOT / "frontend/src/utils/seo.js"
FRONTEND_INDEX_HTML = REPO_ROOT / "frontend/index.html"

OUTPUTS_DIR = PACKAGE_ROOT / "outputs"
DB_PATH = PACKAGE_ROOT / "db" / "runs.db"
MIGRATIONS_DIR = PACKAGE_ROOT / "db" / "migrations"

# LLM (optional — ContentAgent uses for better copy; works without any key)
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "auto").lower()  # auto | gemini | anthropic
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
MANAGER_MODEL = os.getenv("MANAGER_MODEL", "claude-sonnet-4-20250514")
WORKER_MODEL = os.getenv("WORKER_MODEL", "claude-sonnet-4-20250514")


def active_llm_provider() -> str | None:
    """Return 'gemini', 'anthropic', or None if no LLM configured."""
    if LLM_PROVIDER == "gemini" and GEMINI_API_KEY:
        return "gemini"
    if LLM_PROVIDER == "anthropic" and ANTHROPIC_API_KEY:
        return "anthropic"
    if LLM_PROVIDER == "auto":
        if GEMINI_API_KEY:
            return "gemini"
        if ANTHROPIC_API_KEY:
            return "anthropic"
    return None


GOOGLE_PSI_API_KEY = os.getenv("GOOGLE_PSI_API_KEY", "")
SERPAPI_KEY = os.getenv("SERPAPI_KEY", "")
GOOGLE_CSE_API_KEY = os.getenv("GOOGLE_CSE_API_KEY", "")
GOOGLE_CSE_CX = os.getenv("GOOGLE_CSE_CX", "")

# GSC auth: service_account (robot JSON) OR oauth (your Gmail — use if "Add user" fails)
GSC_AUTH_MODE = os.getenv("GSC_AUTH_MODE", "auto").lower()  # auto | oauth | service_account
GSC_SERVICE_ACCOUNT_JSON = os.getenv("GSC_SERVICE_ACCOUNT_JSON", "")
GSC_OAUTH_CLIENT_JSON = os.getenv("GSC_OAUTH_CLIENT_JSON", "./secrets/gsc-oauth-client.json")
GSC_OAUTH_TOKEN_JSON = os.getenv("GSC_OAUTH_TOKEN_JSON", "./secrets/gsc-oauth-token.json")
GSC_PROPERTY_URL = os.getenv("GSC_PROPERTY_URL", f"{SITE_URL}/")

SLACK_WEBHOOK_URL = os.getenv("SLACK_WEBHOOK_URL", "")

# Quota caps
PSI_CACHE_TTL_HOURS = int(os.getenv("PSI_CACHE_TTL_HOURS", "6"))
SERPAPI_MONTHLY_CAP = int(os.getenv("SERPAPI_MONTHLY_CAP", "100"))
SERPAPI_DAILY_CAP = int(os.getenv("SERPAPI_DAILY_CAP", "3"))
GOOGLE_CSE_DAILY_CAP = int(os.getenv("GOOGLE_CSE_DAILY_CAP", "20"))
