const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { getSortFromEvent, buildOrderBy } = require("../../shared/sort");

async function handler(event) {
  const auth = await requirePermission(event, "USERS", "VIEW");
  if (!auth.ok) return auth.resp;

  const userId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(userId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  // Protect account owner (main user): sub-users cannot see the owner in lists.
  // Owner can still see everyone.
  const params = [ctx.accountId];
  const whereExtra = ctx.isAccountOwner ? "" : " AND u.id <> $2";
  if (!ctx.isAccountOwner) params.push(ctx.accountId);

  const sort = getSortFromEvent(event);
  const orderBy = buildOrderBy({
    sortBy: sort.sortBy,
    sortDir: sort.sortDir,
    allowed: {
      created_at: "u.created_at",
      full_name: "u.full_name",
      email: "u.email",
      status: "u.status",
      is_blocked: "u.is_blocked",
      system_role: "r.code",
      custom_role_name: "ur.name"
    },
    fallback: "u.created_at DESC"
  });

  const res = await query(
    `
    SELECT
      u.id,
      u.full_name,
      u.email,
      u.phone_country_code,
      u.phone_number,
      r.code AS system_role,
      u.email_verified,
      u.status,
      u.is_blocked,
      u.must_change_password,
      u.created_at,
      urm.role_id AS custom_role_id,
      ur.name AS custom_role_name
    FROM app_users u
    JOIN roles r ON r.id = u.role_id
    LEFT JOIN user_role_members urm ON urm.user_id = u.id
    LEFT JOIN user_roles ur ON ur.id = urm.role_id
    WHERE u.account_id = $1${whereExtra}
    ${orderBy}
    `,
    params
  );

  return ok({ users: res.rows || [] });
}

module.exports = { handler };

