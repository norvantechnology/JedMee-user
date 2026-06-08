#!/usr/bin/env bash
# Write seo-agents/.env from GitHub Actions secrets (OAuth + API keys).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p secrets

{
  echo "GSC_AUTH_MODE=oauth"
  echo "GSC_PROPERTY_URL=https://jedmee.com/"
  echo "GSC_OAUTH_CLIENT_JSON=./secrets/gsc-oauth-client.json"
  echo "GSC_OAUTH_TOKEN_JSON=./secrets/gsc-oauth-token.json"
  echo "GOOGLE_PSI_API_KEY=${GOOGLE_PSI_API_KEY:-}"
  echo "SERPAPI_KEY=${SERPAPI_KEY:-}"
  echo "GEMINI_API_KEY=${GEMINI_API_KEY:-}"
  echo "LLM_PROVIDER=auto"
  echo "SEO_SITE_URL=https://jedmee.com"
  echo "SEO_REPO_ROOT=${SEO_REPO_ROOT:-$(cd .. && pwd)}"
} > .env

if [ -n "${GSC_OAUTH_CLIENT_B64:-}" ]; then
  echo "$GSC_OAUTH_CLIENT_B64" | base64 -d > secrets/gsc-oauth-client.json
fi
if [ -n "${GSC_OAUTH_TOKEN_B64:-}" ]; then
  echo "$GSC_OAUTH_TOKEN_B64" | base64 -d > secrets/gsc-oauth-token.json
fi

echo "CI .env written (keys redacted)"
