const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");

async function handler(event) {
  const auth = await requirePermission(event, "CUSTOMERS", "DELETE");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const customerId = String(event?.pathParameters?.id || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");
  if (!customerId) return fail(400, "VALIDATION_ERROR", "customer id is required");
  try {
    const open = await query(
      `SELECT COUNT(*)::int AS c
       FROM sales_invoices
       WHERE account_id = $1 AND customer_id = $2
         AND status = 'CONFIRMED'::sales_invoice_status
         AND payment_status IN ('UNPAID'::sales_payment_status, 'PARTIAL'::sales_payment_status)`,
      [ctx.accountId, customerId]
    );
    if (Number(open.rows?.[0]?.c || 0) > 0) {
      return fail(400, "BUSINESS_RULE", "Cannot delete customer with outstanding invoices.");
    }
    await query(
      `UPDATE customers SET deleted_at = now(), updated_at = now(), updated_by_user_id = $3
       WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL`,
      [customerId, ctx.accountId, actorId]
    );
    return ok({ id: customerId }, { message: "Customer deleted." });
  } catch {
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: "Please try again." });
  }
}

module.exports = { handler };
