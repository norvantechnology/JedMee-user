const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { getCustomerOutstandingInfo } = require("../../shared/sales");

async function handler(event) {
  const auth = await requirePermission(event, "CUSTOMERS", "VIEW");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const customerId = String(event?.pathParameters?.id || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");
  if (!customerId) return fail(400, "VALIDATION_ERROR", "customer id is required");
  try {
    const exists = await query(`SELECT id FROM customers WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1`, [customerId, ctx.accountId]);
    if (!exists.rows?.length) return fail(404, "NOT_FOUND", "Customer not found");
    const data = await getCustomerOutstandingInfo(query, ctx.accountId, customerId);
    return ok(data);
  } catch {
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: "Please try again." });
  }
}

module.exports = { handler };
