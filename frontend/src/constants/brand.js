/**
 * Single place for user-visible product name and storage namespace.
 * Override at build time via VITE_APP_DISPLAY_NAME, VITE_APP_DOCUMENT_TITLE, VITE_APP_STORAGE_NS.
 */

function envTrim(key) {
  try {
    if (typeof import.meta === "undefined" || !import.meta.env) return "";
    return String(import.meta.env[key] ?? "").trim();
  } catch {
    return "";
  }
}

export const APP_DISPLAY_NAME = envTrim("VITE_APP_DISPLAY_NAME") || "JedMee";

export const APP_DOCUMENT_TITLE =
  envTrim("VITE_APP_DOCUMENT_TITLE") || `${APP_DISPLAY_NAME} User`;

const rawNs = envTrim("VITE_APP_STORAGE_NS")
  .replace(/[^a-z0-9_-]/gi, "")
  .toLowerCase();

/** Stable prefix for localStorage / sessionStorage keys (avoid spaces). */
export const APP_STORAGE_NS = rawNs || "jedmee";

/** Previous prefix; used only to migrate persisted UI state after rebrand. */
export const LEGACY_STORAGE_PREFIX = "medico";

export function signInSubtitle() {
  return `Sign in to your ${APP_DISPLAY_NAME} account`;
}

export function csvImportMatchColumnsHint() {
  return `Match each file column to a ${APP_DISPLAY_NAME} field. Unmapped columns are ignored.`;
}

export function csvImportTemplatesHint() {
  return `Templates list every column ${APP_DISPLAY_NAME} understands. Use “Sample” to see example values (e.g. from Marg/KMS exports).`;
}

export function csvFieldColumnHeader() {
  return `${APP_DISPLAY_NAME} field`;
}

/** Sales billing defaults (customer / division last used). */
export function salesInvoiceDefaultsStorageKey() {
  const primary = `${APP_STORAGE_NS}_sales_invoice_defaults_v1`;
  const legacy = `${LEGACY_STORAGE_PREFIX}_sales_invoice_defaults_v1`;
  if (typeof window === "undefined") return primary;
  try {
    if (window.localStorage.getItem(primary) != null) return primary;
    const old = window.localStorage.getItem(legacy);
    if (old != null) {
      window.localStorage.setItem(primary, old);
      window.localStorage.removeItem(legacy);
    }
  } catch {
    /* ignore */
  }
  return primary;
}

/** Common table column visibility bucket root key. */
export function commonTableColsStorageRoot() {
  const primary = `${APP_STORAGE_NS}_common_table_cols_v1`;
  const legacy = `${LEGACY_STORAGE_PREFIX}_common_table_cols_v1`;
  if (typeof window === "undefined") return primary;
  try {
    if (window.localStorage.getItem(primary) != null) return primary;
    const old = window.localStorage.getItem(legacy);
    if (old != null) {
      window.localStorage.setItem(primary, old);
      window.localStorage.removeItem(legacy);
    }
  } catch {
    /* ignore */
  }
  return primary;
}

export function sidebarCollapsedStorageKey(variant) {
  const primary = `${APP_STORAGE_NS}_${variant}_sb_collapsed`;
  const legacy = `${LEGACY_STORAGE_PREFIX}_${variant}_sb_collapsed`;
  if (typeof window === "undefined") return primary;
  try {
    if (window.localStorage.getItem(primary) != null) return primary;
    const old = window.localStorage.getItem(legacy);
    if (old != null) {
      window.localStorage.setItem(primary, old);
      window.localStorage.removeItem(legacy);
    }
  } catch {
    /* ignore */
  }
  return primary;
}

export function sidebarNavScrollStorageKey() {
  const primary = `${APP_STORAGE_NS}_sb_nav_scroll`;
  const legacy = `${LEGACY_STORAGE_PREFIX}_sb_nav_scroll`;
  if (typeof window === "undefined") return primary;
  try {
    if (window.sessionStorage.getItem(primary) != null) return primary;
    const old = window.sessionStorage.getItem(legacy);
    if (old != null) {
      window.sessionStorage.setItem(primary, old);
      window.sessionStorage.removeItem(legacy);
    }
  } catch {
    /* ignore */
  }
  return primary;
}

export function announcementDismissStorageKey() {
  return `${APP_STORAGE_NS}_ann_dismiss`;
}

export function announcementGlobalKey(updatedAt) {
  return `${APP_STORAGE_NS}_ann_global_${updatedAt}`;
}
