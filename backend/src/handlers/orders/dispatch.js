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
  if (String(actor?.role_code || "").toUpperCase() !== "WHOLESALER") return fail(403, "FORBIDDEN", "Only wholesaler can dispatch.");

  const id = clean(event?.pathParameters?.id);
  if (!id) return fail(400, "VALIDATION_ERROR", "order id is required.");

  try {
    const out = await withTransaction(async (q) => {
      const up = await q(
        `
        UPDATE orders
        SET status = 'DISPATCHED',
            dispatched_by_user_id = $3,
            dispatched_at = now(),
            updated_at = now()
        WHERE id = $1
          AND wholesaler_account_id = $2
          AND status = 'ACCEPTED'
        RETURNING *
        `,
        [id, perms.accountId, actorId]
      );
      const order = up.rows?.[0];
      if (!order) return { err: fail(404, "NOT_FOUND", "Order not found or not accepted.") };
      await createInAppNotification(
        q,
        order.retailer_account_id,
        order.retailer_account_id,
        "ORDER_DISPATCHED",
        `Order ${order.order_number} is on its way!`,
        "Your order has been dispatched. Please confirm delivery once you receive it.",
        { order_id: order.id },
        `/orders/${order.id}`,
        "View order"
      );
      return { order };
    });
    if (out?.err) return out.err;
    return ok(out, { message: "Order marked as dispatched." });
  } catch {
    return fail(500, "INTERNAL_ERROR", "Failed to dispatch order.");
  }
}

module.exports = { handler };

