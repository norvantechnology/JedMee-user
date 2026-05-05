const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");

function clean(v) {
  return String(v ?? "").trim();
}

async function handler(event) {
  const auth = await requirePermission(event, "PRODUCT_BATCHES", "VIEW");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const qs = event?.queryStringParameters || {};
  const code = clean(qs.code);
  const excludeId = clean(qs.exclude_id || qs.excludeId);
  if (!code) return fail(400, "VALIDATION_ERROR", "code is required");

  try {
    const rs = await query(
      `SELECT id, code, name
       FROM products
       WHERE account_id = $1
         AND deleted_at IS NULL
         AND lower(code) = lower($2)
         AND ($3 = '' OR id::text <> $3)
       LIMIT 1`,
      [ctx.accountId, code, excludeId]
    );
    const existing = rs.rows?.[0] || null;
    return ok({
      exists: Boolean(existing),
      product: existing
    });
  } catch {
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: "Please try again." });
  }
}

module.exports = { handler };
