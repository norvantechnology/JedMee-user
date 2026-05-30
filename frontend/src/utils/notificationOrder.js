/** Order notification helpers — action buttons only for pending orders. */

export function parseNotificationPayload(payload) {
  if (payload == null) return {};
  if (typeof payload === "object" && !Array.isArray(payload)) return payload;
  if (typeof payload === "string") {
    try {
      const p = JSON.parse(payload);
      return typeof p === "object" && p && !Array.isArray(p) ? p : {};
    } catch {
      return {};
    }
  }
  return {};
}

export function notificationSupportsOrderActions(n) {
  if (n?.supports_order_actions === true || n?.supportsOrderActions === true) return true;
  if (n?.supports_order_actions === false || n?.supportsOrderActions === false) return false;
  const type = String(n?.type || "").toUpperCase();
  if (type !== "NEW_ORDER") return false;
  const payload = parseNotificationPayload(n?.payload);
  const status = String(
    n?.order_status ?? n?.orderStatus ?? payload?.order_status ?? payload?.status ?? ""
  ).toUpperCase();
  return status === "PENDING";
}
