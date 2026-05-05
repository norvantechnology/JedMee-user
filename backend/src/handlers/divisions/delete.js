const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");

function getPathParam(event, name) {
  return (
    event?.pathParameters?.[name] ||
    event?.pathParameters?.[name?.toLowerCase?.()] ||
    event?.pathParameters?.[name?.toUpperCase?.()] ||
    ""
  );
}

async function handler(event) {
  const auth = await requirePermission(event, "DIVISIONS", "DELETE");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");
  const id = String(getPathParam(event, "id") || "").trim();
  if (!id) return fail(400, "VALIDATION_ERROR", "id is required");

  try {
    const block = await query(
      `
      SELECT COUNT(*)::int AS c FROM purchase_invoices
      WHERE account_id = $1 AND division_id = $2 AND deleted_at IS NULL AND status <> 'CANCELLED'
      `,
      [ctx.accountId, id]
    );
    const n = Number(block.rows?.[0]?.c || 0);
    if (n > 0) {
      return fail(400, "BUSINESS_RULE", `Cannot delete division with ${n} active purchase invoice(s). Cancel or complete them first.`);
    }

    const del = await query(
      `UPDATE divisions SET deleted_at = now(), updated_at = now(), updated_by_user_id = $3
       WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL RETURNING id`,
      [id, ctx.accountId, actorId]
    );
    if (!del.rows?.[0]) return fail(404, "NOT_FOUND", "Division not found.");
    return ok({ deleted: true }, { message: "Division removed." });
  } catch {
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: "Please try again." });
  }
}

module.exports = { handler };
