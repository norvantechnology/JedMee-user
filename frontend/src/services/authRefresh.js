import { getApiBaseUrl } from "./apiClient.js";
import { readAuth, saveAuth } from "./authStorage.js";

/** @typedef {{ ok: true } | { ok: false, reason: 'no_session' | 'invalid_refresh' | 'transient', status?: number }} RefreshResult */

/** Single in-flight refresh — prevents parallel refresh races across tabs/calls. */
let _refreshFlight = null;

/**
 * Refresh the access token using the stored refresh token.
 * Uses raw fetch (not apiClient) so a failed refresh does not trigger
 * the API interceptor's clearAuth before we can classify the failure.
 *
 * @returns {Promise<RefreshResult>}
 */
export async function tryRefreshSession() {
  if (_refreshFlight) return _refreshFlight;

  _refreshFlight = (async () => {
    const auth = readAuth();
    if (!auth?.refreshToken || !auth?.email) {
      return { ok: false, reason: "no_session" };
    }

    try {
      const url = `${getApiBaseUrl()}/auth/refresh`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          email: auth.email,
          refreshToken: auth.refreshToken
        })
      });

      const json = await res.json().catch(() => null);

      if (res.status >= 200 && res.status < 300 && json?.ok) {
        const data = json?.data || {};
        saveAuth({
          rememberMe: Boolean(auth.rememberMe),
          email: auth.email,
          accessToken: data.accessToken,
          accessExpiresInSec: data.accessExpiresInSec,
          refreshToken: data.refreshToken
        });
        return { ok: true };
      }

      if (res.status === 401) {
        return { ok: false, reason: "invalid_refresh", status: 401 };
      }

      return { ok: false, reason: "transient", status: res.status };
    } catch {
      return { ok: false, reason: "transient" };
    } finally {
      _refreshFlight = null;
    }
  })();

  return _refreshFlight;
}
