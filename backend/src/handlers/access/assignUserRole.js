const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { parseJsonBody } = require("../../shared/request");
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
  const auth = await requirePermission(event, "USERS", "UPDATE");
  if (!auth.ok) return auth.resp;

  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const userId = String(getPathParam(event, "id") || "").trim();
  if (!userId) return fail(400, "VALIDATION_ERROR", "id is required");
  // Protect account owner (main user), even if account_id data is unexpected.
  if (String(ctx.accountId) === String(userId)) return fail(400, "VALIDATION_ERROR", "Cannot change owner role");
  const ownerCheck = await query(`SELECT 1 FROM app_users WHERE id = $1 AND account_id = id LIMIT 1`, [userId]);
  if (ownerCheck.rows[0]) return fail(400, "VALIDATION_ERROR", "Cannot change owner role");

  const body = parseJsonBody(event);
  const roleId = String(body.roleId || "").trim();
  if (!roleId) return fail(400, "VALIDATION_ERROR", "roleId is required");

  const roleRes = await query(`SELECT id FROM user_roles WHERE id = $1 AND account_id = $2 LIMIT 1`, [roleId, ctx.accountId]);
  if (!roleRes.rows[0]) return fail(400, "VALIDATION_ERROR", "roleId is invalid");

  const uRes = await query(`SELECT 1 FROM app_users WHERE id = $1 AND account_id = $2 LIMIT 1`, [userId, ctx.accountId]);
  if (!uRes.rows[0]) return fail(404, "NOT_FOUND", "User not found");

  await query(
    `
    INSERT INTO user_role_members (user_id, role_id)
    VALUES ($1, $2)
    ON CONFLICT (user_id) DO UPDATE SET role_id = EXCLUDED.role_id
    `,
    [userId, roleId]
  );

  return ok({ updated: true }, { message: "User role updated." });
}

module.exports = { handler };

