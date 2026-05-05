/**
 * CommonTable column visibility  persisted in localStorage (frontend-only).
 * Keys are namespaced so multiple tables can coexist; merge safely when column defs change.
 */

import { commonTableColsStorageRoot } from "../constants/brand.js";

function storageRoot() {
  return commonTableColsStorageRoot();
}

function safeJsonParse(s, fallback) {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

/** @returns {{ hidden: string[] } | null} */
export function loadColumnVisibility(storageKey) {
  if (typeof window === "undefined" || !storageKey) return null;
  try {
    const raw = window.localStorage.getItem(storageRoot());
    if (!raw) return null;
    const all = safeJsonParse(raw, {});
    const bucket = all && typeof all === "object" ? all[String(storageKey)] : null;
    if (!bucket || typeof bucket !== "object") return null;
    const hidden = Array.isArray(bucket.hidden) ? bucket.hidden.map(String) : [];
    return { hidden };
  } catch {
    return null;
  }
}

export function saveColumnVisibility(storageKey, hiddenIds) {
  if (typeof window === "undefined" || !storageKey) return;
  try {
    const raw = window.localStorage.getItem(storageRoot());
    const all = safeJsonParse(raw, {});
    const next = { ...(typeof all === "object" && all ? all : {}) };
    next[String(storageKey)] = { hidden: [...hiddenIds].map(String) };
    window.localStorage.setItem(storageRoot(), JSON.stringify(next));
  } catch {
    /* quota / private mode */
  }
}

/** Columns that cannot be hidden (always rendered). */
export function isColumnAlwaysVisible(col) {
  if (!col || col.alwaysVisible === true) return true;
  if (col.excludeFromColumnCustomizer === true) return true;
  const id = String(col.id ?? "");
  if (id === "actions") return true;
  return false;
}

export function getCustomizableColumns(columns) {
  const list = Array.isArray(columns) ? columns : [];
  return list.filter((c) => c?.id != null && !isColumnAlwaysVisible(c));
}
