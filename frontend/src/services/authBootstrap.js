import { clearAuth, hasValidAccessToken, readAuth } from "./authStorage.js";
import { tryRefreshSession } from "./authRefresh.js";

// How many ms before expiry to proactively refresh (2 minutes).
const PROACTIVE_REFRESH_BEFORE_MS = 2 * 60 * 1000;
// How often the background timer checks (every 60 seconds).
const REFRESH_CHECK_INTERVAL_MS = 60 * 1000;

let _refreshTimer = null;

async function doRefresh() {
  const auth = readAuth();
  if (!auth?.refreshToken || !auth?.email) return;

  const expiresAt = Number(auth.accessExpiresAt || 0);
  const msUntilExpiry = expiresAt - Date.now();

  // Only refresh if within the proactive window or already expired.
  if (msUntilExpiry > PROACTIVE_REFRESH_BEFORE_MS) return;

  const r = await tryRefreshSession();
  if (!r.ok && r.reason === "invalid_refresh") {
    clearAuth();
    stopTokenRefreshTimer();
  }
}

export function startTokenRefreshTimer() {
  if (_refreshTimer) return; // already running
  // Check immediately on start, then every 60s.
  doRefresh();
  _refreshTimer = setInterval(doRefresh, REFRESH_CHECK_INTERVAL_MS);
}

export function stopTokenRefreshTimer() {
  if (_refreshTimer) {
    clearInterval(_refreshTimer);
    _refreshTimer = null;
  }
}

export async function bootstrapAuth() {
  const auth = readAuth();
  if (!auth?.refreshToken || !auth?.email) return { ok: false };

  if (hasValidAccessToken(auth)) return { ok: true };

  const r = await tryRefreshSession();
  if (r.ok) return { ok: true };

  // Only clear session when refresh token is invalid — keep session on network/server errors.
  if (r.reason === "invalid_refresh" || r.reason === "no_session") {
    clearAuth();
    return { ok: false };
  }

  return { ok: false, transient: true };
}
