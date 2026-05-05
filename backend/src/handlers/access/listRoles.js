const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { getSortFromEvent, buildOrderBy } = require("../../shared/sort");

async function handler(event) {
  const auth = await requirePermission(event, "ROLES", "VIEW");
  if (!auth.ok) return auth.resp;

  const userId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(userId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const sort = getSortFromEvent(event);
  const orderBy = buildOrderBy({
    sortBy: sort.sortBy,
    sortDir: sort.sortDir,
    allowed: {
      created_at: "created_at",
      name: "name",
      updated_at: "updated_at"
    },
    fallback: "created_at DESC"
  });

  const rolesRes = await query(
    `
    SELECT id, name, created_at, updated_at
    FROM user_roles
    WHERE account_id = $1
    ${orderBy}
    `,
    [ctx.accountId]
  );

  const permRes = await query(
    `
    SELECT p.role_id, p.resource, p.can_add, p.can_view, p.can_update, p.can_delete
    FROM user_role_permissions p
    JOIN user_roles r ON r.id = p.role_id
    WHERE r.account_id = $1
    `,
    [ctx.accountId]
  );

  const byRole = new Map();
  for (const p of permRes.rows || []) {
    const roleId = p.role_id;
    if (!byRole.has(roleId)) byRole.set(roleId, {});
    byRole.get(roleId)[String(p.resource).toUpperCase()] = {
      add: Boolean(p.can_add),
      view: Boolean(p.can_view),
      update: Boolean(p.can_update),
      delete: Boolean(p.can_delete)
    };
  }

  return ok({
    roles: (rolesRes.rows || []).map((r) => ({
      id: r.id,
      name: r.name,
      created_at: r.created_at,
      updated_at: r.updated_at,
      permissions: byRole.get(r.id) || {}
    }))
  });
}

module.exports = { handler };

