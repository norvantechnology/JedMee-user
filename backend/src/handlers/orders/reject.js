const { ok, fail } = require("../../shared/response");
const { parseJsonBody } = require("../../shared/request");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { query, withTransaction } = require("../../shared/db");
const { clean, getAccountContextForUser, createInAppNotification } = require("./_common");

async function handler(event) {
  const auth = await requirePermission(event, "PURCHASE_ORDERS", "UPDATE");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const perms = await getPermissionsForUser(actorId);
  if (!perms.accountId) return fail(400, "BAD_REQUEST", "account not found");
  const actor = await getAccountContextForUser(actorId);
  if (String(actor?.role_code || "").toUpperCase() !== "WHOLESALER") return fail(403, "FORBIDDEN", "Only wholesaler can reject.");

  const id = clean(event?.pathParameters?.id);
  const body = parseJsonBody(event);
  const reason = clean(body.rejection_reason || body.rejectionReason);
  if (!id) return fail(400, "VALIDATION_ERROR", "order id is required.");
  if (!reason) return fail(400, "VALIDATION_ERROR", "rejection_reason is required.");

  try {
    const out = await withTransaction(async (q) => {
      const up = await q(
        `
        UPDATE orders
        SET status = 'REJECTED',
            rejection_reason = $3,
            rejected_by_user_id = $4,
            rejected_at = now(),
            updated_at = now()
        WHERE id = $1
          AND wholesaler_account_id = $2
          AND status = 'PENDING'
        RETURNING *
        `,
        [id, perms.accountId, reason, actorId]
      );
      const order = up.rows?.[0];
      if (!order) return { err: fail(404, "NOT_FOUND", "Order not found or not pending.") };
      await createInAppNotification(
        q,
        order.retailer_account_id,
        order.retailer_account_id,
        "ORDER_REJECTED",
        `Order ${order.order_number} was not accepted`,
        `Your order could not be accepted. ${reason ? `Reason: ${reason}` : "Please contact the supplier for more details."}`,
        { order_id: order.id },
        `/orders/${order.id}`,
        "View order"
      );
      return { order };
    });
    if (out?.err) return out.err;
    return ok(out, { message: "Order rejected." });
  } catch {
    return fail(500, "INTERNAL_ERROR", "Failed to reject order.");
  }
}

module.exports = { handler };

