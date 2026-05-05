const { ok, fail } = require("../../shared/response");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { withTransaction } = require("../../shared/db");
const { clean, getAccountContextForUser, createInAppNotification } = require("./_common");

async function handler(event) {
  const auth = await requirePermission(event, "PURCHASE_ORDERS", "UPDATE");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const perms = await getPermissionsForUser(actorId);
  if (!perms.accountId) return fail(400, "BAD_REQUEST", "account not found");
  const actor = await getAccountContextForUser(actorId);
  if (String(actor?.role_code || "").toUpperCase() !== "RETAILER") return fail(403, "FORBIDDEN", "Only retailer can confirm delivery.");

  const id = clean(event?.pathParameters?.id);
  if (!id) return fail(400, "VALIDATION_ERROR", "order id is required.");

  try {
    const out = await withTransaction(async (q) => {
      const up = await q(
        `
        UPDATE orders
        SET status = 'DELIVERED',
            delivered_at = now(),
            updated_at = now()
        WHERE id = $1
          AND retailer_account_id = $2
          AND status = 'DISPATCHED'
        RETURNING *
        `,
        [id, perms.accountId]
      );
      const order = up.rows?.[0];
      if (!order) return { err: fail(404, "NOT_FOUND", "Order not found or not dispatched.") };
      await createInAppNotification(
        q,
        order.wholesaler_account_id,
        order.wholesaler_account_id,
        "ORDER_DELIVERED",
        `Order ${order.order_number} delivered`,
        `${order.retailer_firm_name} confirmed delivery.`,
        { order_id: order.id }
      );
      return { order };
    });
    if (out?.err) return out.err;
    return ok(out, { message: "Delivery confirmed." });
  } catch {
    return fail(500, "INTERNAL_ERROR", "Failed to confirm delivery.");
  }
}

module.exports = { handler };

