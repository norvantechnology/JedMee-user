#!/usr/bin/env python3
"""One-time browser login for Google Search Console (OAuth).

Use this when adding the service account email in GSC fails with "email not found".
Signs in as your personal Google account that already owns the Search Console property.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import config
from collectors.gsc_client import GSC_SCOPES, _resolve_config_path, _save_oauth_token


def main() -> int:
    client_path = _resolve_config_path(config.GSC_OAUTH_CLIENT_JSON)
    if not client_path:
        print("FAIL: OAuth client JSON not found.")
        print(f"  Expected: {config.GSC_OAUTH_CLIENT_JSON}")
        print()
        print("Create in GCP Console → APIs & Services → Credentials:")
        print("  Create OAuth client ID → Application type: Desktop app")
        print("  Download JSON → save as secrets/gsc-oauth-client.json")
        return 1

    try:
        from google_auth_oauthlib.flow import InstalledAppFlow
    except ImportError:
        print("FAIL: pip install google-auth-oauthlib")
        return 1

    print("Opening browser — sign in with the Google account that owns Search Console")
    print(f"(e.g. the account that sees https://jedmee.com/ in GSC)\n")

    flow = InstalledAppFlow.from_client_secrets_file(str(client_path), GSC_SCOPES)
    creds = flow.run_local_server(port=0, prompt="consent")

    token_path = _save_oauth_token(creds)
    print(f"\nOK: Token saved to {token_path}")
    print("Add to .env:  GSC_AUTH_MODE=oauth")
    print("Test:         python scripts/notify_gsc.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
