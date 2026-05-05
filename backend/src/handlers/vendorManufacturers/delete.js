const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");

async function handler(event) {
  const auth = await requirePermission(event, "VENDORS", "UPDATE");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const id = String(event?.pathParameters?.id || "").trim();
  if (!id) return fail(400, "VALIDATION_ERROR", "id is required");

  try {
    const res = await query(
      `DELETE FROM vendor_manufacturers WHERE id = $1 AND account_id = $2 RETURNING id`,
      [id, ctx.accountId]
    );
    if (!res.rows?.[0]) return fail(404, "NOT_FOUND", "Mapping not found.");
    return ok({ id: res.rows[0].id });
  } catch (e) {
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: String(e.message || "Please try again.") });
  }
}

module.exports = { handler };
