const { created, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { parseJsonBody } = require("../../shared/request");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser, RESOURCES } = require("../../shared/permissions");

function cleanName(v) {
  return String(v || "").trim().replace(/\s+/g, " ");
}

async function handler(event) {
  const auth = await requirePermission(event, "ROLES", "ADD");
  if (!auth.ok) return auth.resp;

  const userId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(userId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const body = parseJsonBody(event);
  const name = cleanName(body.name);
  if (!name || name.length < 2) return fail(400, "VALIDATION_ERROR", "name must be at least 2 characters");

  const ins = await query(
    `
    INSERT INTO user_roles (account_id, name)
    VALUES ($1, $2)
    RETURNING id, name, created_at, updated_at
    `,
    [ctx.accountId, name]
  );

  const role = ins.rows[0];

  // Default permissions: view-only on both resources.
  for (const r of RESOURCES) {
    await query(
      `
      INSERT INTO user_role_permissions (role_id, resource, can_add, can_view, can_update, can_delete)
      VALUES ($1, $2, false, true, false, false)
      ON CONFLICT (role_id, resource) DO NOTHING
      `,
      [role.id, r]
    );
  }

  return created(
    {
      role: {
        id: role.id,
        name: role.name,
        created_at: role.created_at,
        updated_at: role.updated_at
      }
    },
    { message: "Role created." }
  );
}

module.exports = { handler };

