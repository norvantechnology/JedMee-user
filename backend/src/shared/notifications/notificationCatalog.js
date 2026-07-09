/**
 * Notification type registry - maps to P1–P4 priority matrix and delivery rules.
 *
 * Channels:
 *   inApp  - always (stored in user_notifications)
 *   push   - P1 + P2 by default (FCM mobile)
 *   email  - daily digest for P2–P4 summaries (see notificationEmailDigest.js)
 */

const TYPES = {
  // ── P1 CRITICAL - inventory & compliance ─────────────────────────────────
  EXPIRED_BATCH: {
    priority: "P1",
    category: "INVENTORY",
    label: "Expired batch",
    push: true,
    actionPath: "/quality-master",
  },
  STOCK_ZERO: {
    priority: "P1",
    category: "INVENTORY",
    label: "Out of stock",
    push: true,
    actionPath: "/quality-master",
  },
  LOW_STOCK_PRODUCT: {
    priority: "P2",
    category: "INVENTORY",
    label: "Low stock",
    push: true,
    actionPath: "/quality-master",
  },
  LOW_STOCK_BATCH: {
    priority: "P2",
    category: "INVENTORY",
    label: "Batch low stock",
    push: true,
    actionPath: "/quality-master",
  },
  BATCH_EXPIRING_SOON: {
    priority: "P2",
    category: "INVENTORY",
    label: "Expiring soon",
    push: true,
    actionPath: "/quality-master",
  },
  BATCH_NEAR_EXPIRY: {
    priority: "P3",
    category: "INVENTORY",
    label: "Near expiry",
    push: false,
    actionPath: "/quality-master",
  },

  // ── P2 HIGH - payments ─────────────────────────────────────────────────────
  PAYABLE_OVERDUE: {
    priority: "P2",
    category: "PAYMENT",
    label: "Supplier payment overdue",
    push: true,
    actionPath: "/purchase-invoices",
  },
  RECEIVABLE_OVERDUE: {
    priority: "P2",
    category: "PAYMENT",
    label: "Customer payment overdue",
    push: true,
    actionPath: "/sales-billing",
  },
  INVOICE_PAYMENT_DUE: {
    priority: "P3",
    category: "PAYMENT",
    label: "Payment due soon",
    push: false,
    actionPath: "/sales-billing",
  },

  // ── P3 MEDIUM - transactions / orders ────────────────────────────────────
  NEW_ORDER: {
    priority: "P3",
    category: "TRANSACTION",
    label: "New order",
    push: true,
    dataOnly: true,
    actionPath: "/orders",
  },
  ORDER_ACCEPTED: {
    priority: "P3",
    category: "TRANSACTION",
    label: "Order accepted",
    push: false,
    actionPath: "/orders",
  },
  ORDER_REJECTED: {
    priority: "P3",
    category: "TRANSACTION",
    label: "Order rejected",
    push: true,
    actionPath: "/orders",
  },
  ORDER_DISPATCHED: {
    priority: "P3",
    category: "TRANSACTION",
    label: "Order dispatched",
    push: false,
    actionPath: "/orders",
  },
  ORDER_DELIVERED: {
    priority: "P3",
    category: "TRANSACTION",
    label: "Order delivered",
    push: false,
    actionPath: "/orders",
  },
  PURCHASE_RETURN_CONFIRMED: {
    priority: "P3",
    category: "TRANSACTION",
    label: "Return confirmed",
    push: false,
    actionPath: "/purchase-returns",
  },
  SALES_RETURN_REQUESTED: {
    priority: "P3",
    category: "TRANSACTION",
    label: "Return requested",
    push: false,
    actionPath: "/sales-returns",
  },
  INVOICE_PAID: {
    priority: "P4",
    category: "TRANSACTION",
    label: "Invoice paid",
    push: false,
    actionPath: "/sales-billing",
  },

  // ── Digests & admin ────────────────────────────────────────────────────────
  LOW_STOCK_DAILY: {
    priority: "P3",
    category: "INVENTORY",
    label: "Daily stock summary",
    push: true,
    actionPath: "/quality-master",
  },
  INVENTORY_ALERT_DIGEST: {
    priority: "P2",
    category: "INVENTORY",
    label: "Inventory digest",
    push: true,
    actionPath: "/dashboard",
  },
  ADMIN_BROADCAST: {
    priority: "P3",
    category: "SYSTEM",
    label: "Announcement",
    push: true,
    actionPath: "/dashboard",
  },

  // ── P4 LOW - system ────────────────────────────────────────────────────────
  EXPORT_READY: {
    priority: "P4",
    category: "SYSTEM",
    label: "Export ready",
    push: false,
    actionPath: "/reports",
  },
  CATALOG_SYNCED: {
    priority: "P4",
    category: "SYSTEM",
    label: "Catalog synced",
    push: false,
    actionPath: "/quality-master",
  },
};

const DEFAULT_META = {
  priority: "P3",
  category: "SYSTEM",
  label: "Notification",
  push: false,
  actionPath: "/dashboard",
  dataOnly: false,
};

function getNotificationMeta(type) {
  const key = String(type || "").toUpperCase();
  return { ...DEFAULT_META, ...(TYPES[key] || {}) };
}

function shouldSendPush(type, userPrefs = null) {
  const meta = getNotificationMeta(type);
  if (!meta.push) return false;
  if (userPrefs?.push_enabled === false) return false;
  if (userPrefs?.push_critical_only === true) {
    return meta.priority === "P1" || meta.priority === "P2";
  }
  // P1/P2 always push; P3/P4 only when catalog explicitly enables push (e.g. NEW_ORDER).
  if (meta.priority === "P1" || meta.priority === "P2") return true;
  return meta.push === true;
}

function priorityRank(p) {
  const order = { P1: 0, P2: 1, P3: 2, P4: 3 };
  return order[String(p || "P3").toUpperCase()] ?? 2;
}

module.exports = {
  TYPES,
  getNotificationMeta,
  shouldSendPush,
  priorityRank,
};
