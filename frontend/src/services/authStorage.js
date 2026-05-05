import { APP_STORAGE_NS, LEGACY_STORAGE_PREFIX } from "../constants/brand.js";

const LS_KEY = `${APP_STORAGE_NS}_auth_v1`;
const LEGACY_LS_KEY = `${LEGACY_STORAGE_PREFIX}_auth_v1`;
const AUTH_EVENT = `${APP_STORAGE_NS}-auth-changed`;

function safeJsonParse(s) {
  try {
    return JSON.parse(String(s || ""));
  } catch {
    return null;
  }
}

function getStore(remember) {
  return remember ? window.localStorage : window.sessionStorage;
}

function migrateLegacyAuthIfPresent() {
  try {
    const nextLs = safeJsonParse(window.localStorage.getItem(LS_KEY));
    const nextSs = safeJsonParse(window.sessionStorage.getItem(LS_KEY));
    if (nextLs?.refreshToken || nextSs?.refreshToken) return;

    const legacyLs = safeJsonParse(window.localStorage.getItem(LEGACY_LS_KEY));
    const legacySs = safeJsonParse(window.sessionStorage.getItem(LEGACY_LS_KEY));
    const payload = legacyLs?.refreshToken ? legacyLs : legacySs?.refreshToken ? legacySs : null;
    if (!payload?.refreshToken) return;

    const store = getStore(Boolean(payload.rememberMe));
    window.localStorage.removeItem(LS_KEY);
    window.sessionStorage.removeItem(LS_KEY);
    window.localStorage.removeItem(LEGACY_LS_KEY);
    window.sessionStorage.removeItem(LEGACY_LS_KEY);
    store.setItem(LS_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

function emitAuthChanged() {
  try {
    window.dispatchEvent(new Event(AUTH_EVENT));
  } catch {
    // ignore
  }
}

export function onAuthChanged(handler) {
  window.addEventListener(AUTH_EVENT, handler);
  return () => window.removeEventListener(AUTH_EVENT, handler);
}

export function saveAuth({ rememberMe, email, accessToken, accessExpiresInSec, refreshToken, user, access }) {
  migrateLegacyAuthIfPresent();
  const existing = readAuth();
  const sameIdentity = existing?.email && String(existing.email) === String(email || "");
  const store = getStore(Boolean(rememberMe));
  const payload = {
    rememberMe: Boolean(rememberMe),
    email: String(email || ""),
    accessToken: String(accessToken || ""),
    accessExpiresAt: Date.now() + Number(accessExpiresInSec || 0) * 1000,
    refreshToken: String(refreshToken || ""),
    user: user !== undefined ? user : sameIdentity ? existing?.user || null : null,
    access: access !== undefined ? access : sameIdentity ? existing?.access || null : null
  };
  window.localStorage.removeItem(LS_KEY);
  window.sessionStorage.removeItem(LS_KEY);
  window.localStorage.removeItem(LEGACY_LS_KEY);
  window.sessionStorage.removeItem(LEGACY_LS_KEY);
  store.setItem(LS_KEY, JSON.stringify(payload));
  emitAuthChanged();
}

export function saveAuthUser(user) {
  migrateLegacyAuthIfPresent();
  const existing = readAuth();
  if (!existing?.refreshToken) return;
  const store = getStore(Boolean(existing.rememberMe));
  const next = { ...existing, user: user || null };
  window.localStorage.removeItem(LS_KEY);
  window.sessionStorage.removeItem(LS_KEY);
  window.localStorage.removeItem(LEGACY_LS_KEY);
  window.sessionStorage.removeItem(LEGACY_LS_KEY);
  store.setItem(LS_KEY, JSON.stringify(next));
  emitAuthChanged();
}

export function saveAuthAccess(access) {
  migrateLegacyAuthIfPresent();
  const existing = readAuth();
  if (!existing?.refreshToken) return;
  const store = getStore(Boolean(existing.rememberMe));
  const next = { ...existing, access: access || null };
  window.localStorage.removeItem(LS_KEY);
  window.sessionStorage.removeItem(LS_KEY);
  window.localStorage.removeItem(LEGACY_LS_KEY);
  window.sessionStorage.removeItem(LEGACY_LS_KEY);
  store.setItem(LS_KEY, JSON.stringify(next));
  emitAuthChanged();
}

export function readAuth() {
  migrateLegacyAuthIfPresent();
  const fromLs = safeJsonParse(window.localStorage.getItem(LS_KEY));
  if (fromLs?.refreshToken) return fromLs;
  const fromSs = safeJsonParse(window.sessionStorage.getItem(LS_KEY));
  if (fromSs?.refreshToken) return fromSs;
  return null;
}

export function clearAuth() {
  window.localStorage.removeItem(LS_KEY);
  window.sessionStorage.removeItem(LS_KEY);
  window.localStorage.removeItem(LEGACY_LS_KEY);
  window.sessionStorage.removeItem(LEGACY_LS_KEY);
  emitAuthChanged();
}

export function hasValidAccessToken(auth) {
  if (!auth?.accessToken) return false;
  if (!auth?.accessExpiresAt) return false;
  return Number(auth.accessExpiresAt) > Date.now() + 10_000; // 10s skew
}
