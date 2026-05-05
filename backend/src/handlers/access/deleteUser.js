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
  const auth = await requirePermission(event, "USERS", "DELETE");
  if (!auth.ok) return auth.resp;

  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const userId = String(getPathParam(event, "id") || "").trim();
  if (!userId) return fail(400, "VALIDATION_ERROR", "id is required");
  // Protect account owner (main user), even if account_id data is unexpected.
  if (String(ctx.accountId) === String(userId)) return fail(400, "VALIDATION_ERROR", "Cannot delete account owner");
  const ownerCheck = await query(`SELECT 1 FROM app_users WHERE id = $1 AND account_id = id LIMIT 1`, [userId]);
  if (ownerCheck.rows[0]) return fail(400, "VALIDATION_ERROR", "Cannot delete account owner");

  const del = await query(`DELETE FROM app_users WHERE id = $1 AND account_id = $2 RETURNING id`, [userId, ctx.accountId]);
  if (!del.rows[0]) return fail(404, "NOT_FOUND", "User not found");

  return ok({ deleted: true }, { message: "User deleted." });
}

module.exports = { handler };

