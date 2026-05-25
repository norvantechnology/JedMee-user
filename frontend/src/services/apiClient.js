const DEFAULT_BASE_URL = "http://localhost:4000";
import { emitApiToastFromResponse } from "./toastBus.js";
import { readAuth, clearAuth } from "./authStorage.js";
import { tryRefreshSession } from "./authRefresh.js";
import { requestNotificationInboxRefresh, shouldRefreshNotificationInboxFromRequest } from "./notificationInboxBus.js";

let lastAuthExpiredToastAt = 0;
let lastAuthClearAt = 0;

function shouldThrottleAuthExpiredToast() {
  const now = Date.now();
  // Prevent “toast spam” when multiple requests fail together.
  return now - lastAuthExpiredToastAt < 2500;
}

function markAuthExpiredToastShown() {
  lastAuthExpiredToastAt = Date.now();
}

function clearAuthOnce() {
  const now = Date.now();
  if (now - lastAuthClearAt < 1500) return;
  lastAuthClearAt = now;
  clearAuth();
}

export function getApiBaseUrl() {
  const base = import.meta.env.VITE_API_BASE_URL || DEFAULT_BASE_URL;
  return String(base).replace(/\/+$/, "");
}

async function apiFetch(method, url, body, opts, attempt = 0) {
  const auth = readAuth();
  const headers = {
    accept: "application/json",
    ...(method !== "GET" ? { "content-type": "application/json" } : {}),
    ...(auth?.accessToken ? { Authorization: `Bearer ${auth.accessToken}` } : {})
  };

  const res = await fetch(url, {
    method,
    headers,
    ...(method !== "GET" ? { body: JSON.stringify(body || {}) } : {})
  });

  const json = await res.json().catch(() => null);
  const resp = { status: res.status, json };

  // If access token expired but refresh session is valid, silently refresh and retry once.
  const canRetry =
    resp.status === 401 &&
    attempt === 0 &&
    !String(url).includes("/auth/refresh") &&
    !String(url).includes("/auth/login");

  if (canRetry) {
    const r = await tryRefreshSession();
    if (r.ok) return await apiFetch(method, url, body, opts, 1);

    // Only wipe session when refresh token is definitively invalid — not on network blips.
    if (r.reason === "invalid_refresh" || r.reason === "no_session") {
      clearAuthOnce();
      const toastMode = opts?.toast ?? "auto";
      if (toastMode !== "none" && !shouldThrottleAuthExpiredToast()) {
        markAuthExpiredToastShown();
        emitApiToastFromResponse(resp);
      }
    }
    return resp;
  }

  const toastMode = opts?.toast ?? "auto"; // auto | none
  if (resp.status === 401) {
    // No refresh attempted (missing refresh token or auth endpoint).
    clearAuthOnce();

    // Only show one auth-expired toast for a burst of 401s.
    if (toastMode !== "none" && !shouldThrottleAuthExpiredToast()) {
      markAuthExpiredToastShown();
      emitApiToastFromResponse(resp);
    }
    return resp;
  }

  if (toastMode !== "none") emitApiToastFromResponse(resp);

  if (resp.status >= 200 && resp.status < 300 && resp.json?.ok && shouldRefreshNotificationInboxFromRequest(method, url)) {
    requestNotificationInboxRefresh({ reason: "inventory-or-broadcast", method, url });
  }

  return resp;
}

export async function apiGet(path, opts) {
  const base = `${getApiBaseUrl()}${path.startsWith("/") ? "" : "/"}${path}`;
  const params = opts?.params && typeof opts.params === "object" ? opts.params : null;
  const qs = params
    ? new URLSearchParams(
        Object.entries(params)
          .filter(([, v]) => v !== undefined && v !== null && String(v) !== "")
          .map(([k, v]) => [k, String(v)])
      ).toString()
    : "";
  const url = qs ? `${base}?${qs}` : base;
  return await apiFetch("GET", url, null, opts);
}

export async function apiPost(path, body, opts) {
  const url = `${getApiBaseUrl()}${path.startsWith("/") ? "" : "/"}${path}`;
  return await apiFetch("POST", url, body, opts);
}

export async function apiPut(path, body, opts) {
  const url = `${getApiBaseUrl()}${path.startsWith("/") ? "" : "/"}${path}`;
  return await apiFetch("PUT", url, body, opts);
}

export async function apiDelete(path, body, opts) {
  const url = `${getApiBaseUrl()}${path.startsWith("/") ? "" : "/"}${path}`;
  return await apiFetch("DELETE", url, body, opts);
}

export async function apiPatch(path, body, opts) {
  const url = `${getApiBaseUrl()}${path.startsWith("/") ? "" : "/"}${path}`;
  return await apiFetch("PATCH", url, body, opts);
}
