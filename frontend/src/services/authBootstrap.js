import { refresh } from "./authService.js";
import { clearAuth, hasValidAccessToken, readAuth, saveAuth } from "./authStorage.js";

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

  const resp = await refresh({ email: auth.email, refreshToken: auth.refreshToken });
  if (resp.status >= 200 && resp.status < 300 && resp.json?.ok) {
    const data = resp.json?.data || {};
    saveAuth({
      rememberMe: Boolean(auth.rememberMe),
      email: auth.email,
      accessToken: data.accessToken,
      accessExpiresInSec: data.accessExpiresInSec,
      refreshToken: data.refreshToken
    });
  } else if (resp.status === 401) {
    // Refresh token itself is expired — clear session.
    clearAuth();
    stopTokenRefreshTimer();
  }
}

export function startTokenRefreshTimer() {
  if (_refreshTimer) return; // already running
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

  const resp = await refresh({ email: auth.email, refreshToken: auth.refreshToken });
  if (resp.status >= 200 && resp.status < 300 && resp.json?.ok) {
    const data = resp.json?.data || {};
    saveAuth({
      rememberMe: Boolean(auth.rememberMe),
      email: auth.email,
      accessToken: data.accessToken,
      accessExpiresInSec: data.accessExpiresInSec,
      refreshToken: data.refreshToken
    });
    return { ok: true };
  }

  clearAuth();
  return { ok: false };
}

