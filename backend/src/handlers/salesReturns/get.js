const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");

async function handler(event) {
  const auth = await requirePermission(event, "SALES_RETURNS", "VIEW");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const id = String(event?.pathParameters?.id || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");
  if (!id) return fail(400, "VALIDATION_ERROR", "return id is required");
  try {
    const ret = await query(`SELECT * FROM sales_returns WHERE id = $1 AND account_id = $2 LIMIT 1`, [id, ctx.accountId]);
    const row = ret.rows?.[0] || null;
    if (!row) return fail(404, "NOT_FOUND", "Sales return not found");
    const items = await query(`SELECT * FROM sales_return_items WHERE sales_return_id = $1 AND account_id = $2 ORDER BY created_at ASC`, [id, ctx.accountId]);
    return ok({ returnItem: row, items: items.rows || [] });
  } catch {
    return fail(500, "INTERNAL_ERROR", "Something went wrong.");
  }
}

module.exports = { handler };
