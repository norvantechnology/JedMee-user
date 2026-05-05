/**
 * When server-side handlers create in-app notifications (e.g. low stock), the same
 * browser tab can refresh the bell count immediately by dispatching this event after
 * the mutating API returns successfully  no full page refresh.
 */
const EVENT = "medico-notification-inbox-refresh";

/**
 * @param {Record<string, unknown>} [detail]
 */
export function requestNotificationInboxRefresh(detail = {}) {
  try {
    window.dispatchEvent(new CustomEvent(EVENT, { detail }));
  } catch {
    // ignore (non-browser tests)
  }
}

/**
 * @param {(detail: Record<string, unknown>) => void} handler
 * @returns {() => void}
 */
export function subscribeNotificationInboxRefresh(handler) {
  const fn = (e) => handler(e.detail || {});
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}

/**
 * Paths that may insert rows into user_notifications (instant low stock, broadcast, etc.).
 * Keep in sync with backend handlers that call refreshLowStockNotifications / broadcast.
 *
 * @param {string} method
 * @param {string} requestUrl full URL
 * @returns {boolean}
 */
export function shouldRefreshNotificationInboxFromRequest(method, requestUrl) {
  const m = String(method || "").toUpperCase();
  if (!["POST", "PUT", "PATCH"].includes(m)) return false;

  let path = "";
  try {
    path = new URL(String(requestUrl)).pathname || "";
  } catch {
    return false;
  }

  const p = path.replace(/\/+$/, "") || "/";

  if (m === "POST") {
    if (/\/sales-invoices\/[^/]+\/confirm$/.test(p)) return true;
    if (/\/sales-invoices\/[^/]+\/cancel$/.test(p)) return true;
    if (p.endsWith("/sales-invoices/bulk-cancel")) return true;
    if (/\/purchase-invoices\/[^/]+\/confirm$/.test(p)) return true;
    if (/\/purchase-invoices\/[^/]+\/cancel$/.test(p)) return true;
    if (p.endsWith("/purchase-invoices/bulk-cancel")) return true;
    if (/\/sales-returns\/[^/]+\/confirm$/.test(p)) return true;
    if (/\/purchase-returns\/[^/]+\/confirm$/.test(p)) return true;
    if (p.endsWith("/notifications/broadcast")) return true;
    if (p === "/api/product-batches") return true;
  }

  if (m === "PUT" || m === "PATCH") {
    if (/\/api\/product-batches\/[^/]+$/.test(p)) return true;
    if (/\/products\/[^/]+$/.test(p)) return true;
  }

  return false;
}
