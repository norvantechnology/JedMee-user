const { ok } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requireAuth } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { getRoleCodeForAccount } = require("../../shared/accountRoleProfile");

async function handler(event) {
  const auth = requireAuth(event);
  if (!auth.ok) return auth.resp;
  const userId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(userId);

  let customRoleId = null;
  let customRoleName = null;
  if (ctx.accountId && !ctx.isAccountOwner) {
    const r = await query(
      `
      SELECT ur.id AS role_id, ur.name
      FROM user_role_members urm
      JOIN user_roles ur ON ur.id = urm.role_id
      WHERE urm.user_id = $1
        AND ur.account_id = $2
      LIMIT 1
      `,
      [userId, ctx.accountId]
    );
    customRoleId = r.rows[0]?.role_id || null;
    customRoleName = r.rows[0]?.name || null;
  }
  const roleCode = ctx.accountId ? await getRoleCodeForAccount(ctx.accountId) : "WHOLESALER";

  return ok({
    access: {
      accountId: ctx.accountId,
      isAccountOwner: Boolean(ctx.isAccountOwner),
      roleCode,
      permissions: ctx.permissions || {},
      customRoleId,
      customRoleName
    }
  });
}

module.exports = { handler };

