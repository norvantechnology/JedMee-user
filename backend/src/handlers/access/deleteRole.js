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
  const auth = await requirePermission(event, "ROLES", "DELETE");
  if (!auth.ok) return auth.resp;

  const userId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(userId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const roleId = String(getPathParam(event, "id") || "").trim();
  if (!roleId) return fail(400, "VALIDATION_ERROR", "id is required");

  // Prevent orphaning users: if anyone is assigned to this role, refuse.
  const memberCount = await query(`SELECT COUNT(*)::int AS c FROM user_role_members WHERE role_id = $1`, [roleId]);
  const assigned = Number(memberCount.rows?.[0]?.c || 0);
  if (assigned > 0) {
    return fail(400, "ROLE_IN_USE", `Cannot delete role: ${assigned} user(s) are assigned.`, {
      subMessage: "Reassign the affected users to a different role first, then try again."
    });
  }

  const del = await query(
    `
    DELETE FROM user_roles
    WHERE id = $1 AND account_id = $2
    RETURNING id
    `,
    [roleId, ctx.accountId]
  );
  if (!del.rows[0]) return fail(404, "NOT_FOUND", "Role not found");

  return ok({ deleted: true }, { message: "Role deleted." });
}

module.exports = { handler };

