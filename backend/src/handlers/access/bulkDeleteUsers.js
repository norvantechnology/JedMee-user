const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { parseJsonBody } = require("../../shared/request");
const { parseIdsFromBody } = require("../../shared/bulkIds");

async function handler(event) {
  const auth = await requirePermission(event, "USERS", "DELETE");
  if (!auth.ok) return auth.resp;

  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const parsed = parseIdsFromBody(parseJsonBody(event));
  if (!parsed.ok) return fail(400, "VALIDATION_ERROR", parsed.error);
  const ids = parsed.ids;

  const deletedIds = [];
  const failed = [];

  for (const userId of ids) {
    if (String(ctx.accountId) === String(userId)) {
      failed.push({ id: userId, message: "Cannot delete account owner" });
      continue;
    }
    const ownerCheck = await query(`SELECT 1 FROM app_users WHERE id = $1 AND account_id = id LIMIT 1`, [userId]);
    if (ownerCheck.rows[0]) {
      failed.push({ id: userId, message: "Cannot delete account owner" });
      continue;
    }
    const del = await query(`DELETE FROM app_users WHERE id = $1 AND account_id = $2 RETURNING id`, [userId, ctx.accountId]);
    if (!del.rows[0]) failed.push({ id: userId, message: "User not found" });
    else deletedIds.push(userId);
  }

  return ok(
    { deletedIds, failed },
    {
      message:
        failed.length && deletedIds.length
          ? `Deleted ${deletedIds.length} user(s); ${failed.length} could not be deleted.`
          : failed.length
            ? "No users were deleted."
            : `Deleted ${deletedIds.length} user(s).`
    }
  );
}

module.exports = { handler };
