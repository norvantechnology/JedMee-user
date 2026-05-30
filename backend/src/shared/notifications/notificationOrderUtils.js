/**
 * Order-linked notification helpers — action buttons only for pending orders.
 */

const ORDER_ACTION_TYPES = new Set(["NEW_ORDER"]);

function parsePayload(payload) {
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

function orderIdFromNotification(row) {
  const p = parsePayload(row?.payload);
  const id = p.order_id || p.orderId || row?.order_id || row?.orderId;
  return id ? String(id) : null;
}

function orderStatusFromNotification(row, liveStatusByOrderId) {
  const top = row?.order_status ?? row?.orderStatus;
  if (top) return String(top).toUpperCase();
  const p = parsePayload(row?.payload);
  const fromPayload = p.status || p.order_status || p.orderStatus;
  if (fromPayload) return String(fromPayload).toUpperCase();
  const oid = orderIdFromNotification(row);
  if (oid && liveStatusByOrderId && liveStatusByOrderId[oid]) {
    return String(liveStatusByOrderId[oid]).toUpperCase();
  }
  return "";
}

/** Wholesaler Accept / Cancel — only while order is still PENDING. */
function notificationSupportsOrderActions(row, liveStatusByOrderId = null) {
  const type = String(row?.type || "").toUpperCase();
  if (!ORDER_ACTION_TYPES.has(type)) return false;
  return orderStatusFromNotification(row, liveStatusByOrderId) === "PENDING";
}

async function enrichNotificationsWithOrderStatus(rows) {
  if (!rows?.length) return rows || [];
  const orderIds = [];
  for (const r of rows) {
    if (ORDER_ACTION_TYPES.has(String(r.type || "").toUpperCase())) {
      const oid = orderIdFromNotification(r);
      if (oid) orderIds.push(oid);
    }
  }
  if (!orderIds.length) return rows;

  const { query } = require("../db");
  let statusRows = [];
  try {
    const res = await query(
      `SELECT id, status::text AS status FROM orders WHERE id = ANY($1::uuid[])`,
      [orderIds]
    );
    statusRows = res.rows || [];
  } catch (e) {
    console.error("[notifications] order status enrich failed:", e);
    return rows;
  }

  const live = Object.create(null);
  for (const r of statusRows) {
    live[String(r.id)] = String(r.status || "").toUpperCase();
  }

  return rows.map((row) => {
    const type = String(row.type || "").toUpperCase();
    if (!ORDER_ACTION_TYPES.has(type)) return row;
    const oid = orderIdFromNotification(row);
    const status = oid ? live[oid] || orderStatusFromNotification(row) : orderStatusFromNotification(row);
    const payload = { ...parsePayload(row.payload) };
    if (status) {
      payload.status = status;
      payload.order_status = status;
    }
    const supportsActions = status === "PENDING";
    return {
      ...row,
      payload,
      order_status: status || null,
      supports_order_actions: supportsActions,
      // View order link stays; Accept/Cancel are gated client-side via supports_order_actions
      action_label: row.action_label,
    };
  });
}

module.exports = {
  ORDER_ACTION_TYPES,
  parsePayload,
  orderIdFromNotification,
  orderStatusFromNotification,
  notificationSupportsOrderActions,
  enrichNotificationsWithOrderStatus,
};
