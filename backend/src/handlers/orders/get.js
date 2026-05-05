const { ok, fail } = require("../../shared/response");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { query } = require("../../shared/db");
const { clean } = require("./_common");

async function handler(event) {
  const auth = await requirePermission(event, "PURCHASE_ORDERS", "VIEW");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const perms = await getPermissionsForUser(actorId);
  if (!perms.accountId) return fail(400, "BAD_REQUEST", "account not found");
  const id = clean(event?.pathParameters?.id);
  if (!id) return fail(400, "VALIDATION_ERROR", "order id is required.");

  try {
    const r = await query(
      `
      SELECT *
      FROM orders
      WHERE id = $1
        AND (retailer_account_id = $2 OR wholesaler_account_id = $2)
      LIMIT 1
      `,
      [id, perms.accountId]
    );
    const order = r.rows?.[0];
    if (!order) return fail(404, "NOT_FOUND", "Order not found.");

    const items = await query(
      `
      SELECT oi.*
      FROM order_items oi
      WHERE oi.order_id = $1
      ORDER BY oi.created_at ASC
      `,
      [id]
    );
    return ok({ order, items: items.rows || [] });
  } catch {
    return fail(500, "INTERNAL_ERROR", "Failed to load order.");
  }
}

module.exports = { handler };

