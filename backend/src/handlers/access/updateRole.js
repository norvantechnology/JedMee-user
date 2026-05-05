const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { parseJsonBody } = require("../../shared/request");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser, normalizeResource } = require("../../shared/permissions");

function getPathParam(event, name) {
  return (
    event?.pathParameters?.[name] ||
    event?.pathParameters?.[name?.toLowerCase?.()] ||
    event?.pathParameters?.[name?.toUpperCase?.()] ||
    ""
  );
}

function cleanName(v) {
  return String(v || "").trim().replace(/\s+/g, " ");
}

function toBool(v) {
  return Boolean(v);
}

async function handler(event) {
  const auth = await requirePermission(event, "ROLES", "UPDATE");
  if (!auth.ok) return auth.resp;

  const userId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(userId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const roleId = String(getPathParam(event, "id") || "").trim();
  if (!roleId) return fail(400, "VALIDATION_ERROR", "id is required");

  const body = parseJsonBody(event);

  const hasName = body.name != null;
  const hasPerms = body.permissions && typeof body.permissions === "object";

  if (!hasName && !hasPerms) {
    return fail(400, "VALIDATION_ERROR", "Nothing to update");
  }

  const roleRes = await query(`SELECT id FROM user_roles WHERE id = $1 AND account_id = $2 LIMIT 1`, [roleId, ctx.accountId]);
  if (!roleRes.rows[0]) return fail(404, "NOT_FOUND", "Role not found");

  let roleRow = null;

  if (hasName) {
    const name = cleanName(body.name);
    if (name.length < 2) return fail(400, "VALIDATION_ERROR", "name must be at least 2 characters");
    const upd = await query(
      `
      UPDATE user_roles
      SET name = $3, updated_at = now()
      WHERE id = $1 AND account_id = $2
      RETURNING id, name, created_at, updated_at
      `,
      [roleId, ctx.accountId, name]
    );
    if (!upd.rows[0]) return fail(404, "NOT_FOUND", "Role not found");
    roleRow = upd.rows[0];
  }

  if (hasPerms) {
    const perms = body.permissions;
    const resources = Object.keys(perms);
    if (!resources.length) return fail(400, "VALIDATION_ERROR", "permissions are required");

    for (const resourceKey of resources) {
      const resource = normalizeResource(resourceKey);
      if (!resource) return fail(400, "VALIDATION_ERROR", `Invalid resource: ${resourceKey}`);
      const p = perms[resourceKey] || {};
      await query(
        `
        INSERT INTO user_role_permissions (role_id, resource, can_add, can_view, can_update, can_delete)
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (role_id, resource)
        DO UPDATE SET
          can_add = EXCLUDED.can_add,
          can_view = EXCLUDED.can_view,
          can_update = EXCLUDED.can_update,
          can_delete = EXCLUDED.can_delete,
          updated_at = now()
        `,
        [roleId, resource, toBool(p.add), toBool(p.view), toBool(p.update), toBool(p.delete)]
      );
    }
  }

  const message =
    hasName && hasPerms ? "Role updated." : hasName ? "Role name updated." : "Role permissions updated.";

  const data = {};
  if (roleRow) data.role = roleRow;
  if (hasPerms) data.updated = true;

  return ok(data, { message });
}

module.exports = { handler };

