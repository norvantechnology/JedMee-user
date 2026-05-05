const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { parseJsonBody } = require("../../shared/request");
const { parseIdsFromBody } = require("../../shared/bulkIds");

async function handler(event) {
  const auth = await requirePermission(event, "ROLES", "DELETE");
  if (!auth.ok) return auth.resp;

  const userId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(userId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const parsed = parseIdsFromBody(parseJsonBody(event));
  if (!parsed.ok) return fail(400, "VALIDATION_ERROR", parsed.error);
  const ids = parsed.ids;

  const deletedIds = [];
  const failed = [];

  for (const roleId of ids) {
    const memberCount = await query(`SELECT COUNT(*)::int AS c FROM user_role_members WHERE role_id = $1`, [roleId]);
    const assigned = Number(memberCount.rows?.[0]?.c || 0);
    if (assigned > 0) {
      failed.push({
        id: roleId,
        message: `Cannot delete role: ${assigned} user(s) are assigned.`
      });
      continue;
    }
    const del = await query(
      `
      DELETE FROM user_roles
      WHERE id = $1 AND account_id = $2
      RETURNING id
      `,
      [roleId, ctx.accountId]
    );
    if (!del.rows[0]) failed.push({ id: roleId, message: "Role not found" });
    else deletedIds.push(roleId);
  }

  return ok(
    { deletedIds, failed },
    {
      message:
        failed.length && deletedIds.length
          ? `Deleted ${deletedIds.length} role(s); ${failed.length} could not be deleted.`
          : failed.length
            ? "No roles were deleted."
            : `Deleted ${deletedIds.length} role(s).`
    }
  );
}

module.exports = { handler };
