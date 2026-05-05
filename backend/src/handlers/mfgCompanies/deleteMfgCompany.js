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
  const auth = await requirePermission(event, "MFG_COMPANIES", "DELETE");
  if (!auth.ok) return auth.resp;

  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const id = String(getPathParam(event, "id") || "").trim();
  if (!id) return fail(400, "VALIDATION_ERROR", "id is required");

  const upd = await query(
    `
    UPDATE mfg_companies
    SET deleted_at = now(), updated_at = now()
    WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL
    RETURNING id
    `,
    [id, ctx.accountId]
  );
  if (!upd.rows[0]) return fail(404, "NOT_FOUND", "Company not found.");
  return ok({ deleted: true }, { message: "Deleted.", subMessage: "Company has been removed successfully." });
}

module.exports = { handler };

