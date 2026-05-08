/**
 * Shared bus for the pending-order badge count shown on the sidebar Orders item.
 * Any component can call requestOrderBadgeRefresh() to trigger a re-fetch.
 * Sidebar subscribes via subscribeOrderBadge().
 */
const EVENT = "jedmee-order-badge-refresh";

export function requestOrderBadgeRefresh() {
  try {
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    // ignore (non-browser tests)
  }
}

/**
 * @param {() => void} handler
 * @returns {() => void} unsubscribe
 */
export function subscribeOrderBadgeRefresh(handler) {
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}