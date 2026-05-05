const { ok, fail } = require("../../shared/response");
const { parseJsonBody } = require("../../shared/request");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { query } = require("../../shared/db");
const { clean, getAccountContextForUser } = require("./_common");

async function handler(event) {
  const auth = await requirePermission(event, "PURCHASE_ORDERS", "UPDATE");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const perms = await getPermissionsForUser(actorId);
  if (!perms.accountId) return fail(400, "BAD_REQUEST", "account not found");
  const actor = await getAccountContextForUser(actorId);
  if (String(actor?.role_code || "").toUpperCase() !== "WHOLESALER") return fail(403, "FORBIDDEN", "Only wholesaler can cancel accepted order.");

  const id = clean(event?.pathParameters?.id);
  if (!id) return fail(400, "VALIDATION_ERROR", "order id is required.");
  const body = parseJsonBody(event);
  const reason = clean(body.cancellation_reason || body.cancellationReason) || "Cancelled by wholesaler";

  try {
    const up = await query(
      `
      UPDATE orders
      SET status = 'CANCELLED',
          cancellation_reason = $3,
          cancelled_by_user_id = $4,
          cancelled_at = now(),
          updated_at = now()
      WHERE id = $1
        AND wholesaler_account_id = $2
        AND status = 'ACCEPTED'
      RETURNING *
      `,
      [id, perms.accountId, reason, actorId]
    );
    if (!up.rows?.[0]) return fail(404, "NOT_FOUND", "Order not found or cannot be cancelled now.");
    return ok({ order: up.rows[0] }, { message: "Order cancelled." });
  } catch {
    return fail(500, "INTERNAL_ERROR", "Failed to cancel order.");
  }
}

module.exports = { handler };

