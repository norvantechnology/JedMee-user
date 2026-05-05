const { ok, fail } = require("../../shared/response");
const { parseJsonBody } = require("../../shared/request");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { clean } = require("../../shared/sales");

async function handler(event) {
  const auth = await requirePermission(event, "SALES_RETURNS", "DELETE");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const id = String(event?.pathParameters?.id || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");
  if (!id) return fail(400, "VALIDATION_ERROR", "return id is required");
  const body = parseJsonBody(event);
  const reason = clean(body.cancelReason || body.cancel_reason || "Cancelled from UI");
  try {
    const rs = await query(`SELECT status FROM sales_returns WHERE id = $1 AND account_id = $2 LIMIT 1`, [id, ctx.accountId]);
    const row = rs.rows?.[0] || null;
    if (!row) return fail(404, "NOT_FOUND", "Sales return not found");
    if (String(row.status) === "CONFIRMED") return fail(400, "BUSINESS_RULE", "Confirmed sales return cannot be cancelled.");
    await query(
      `UPDATE sales_returns SET status = 'CANCELLED'::sales_return_status, cancel_reason = $3, updated_at = now()
       WHERE id = $1 AND account_id = $2`,
      [id, ctx.accountId, reason]
    );
    return ok({ id }, { message: "Sales return cancelled." });
  } catch {
    return fail(500, "INTERNAL_ERROR", "Something went wrong.");
  }
}

module.exports = { handler };
