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
  const auth = await requirePermission(event, "DIVISIONS", "VIEW");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");
  const id = String(getPathParam(event, "id") || "").trim();
  if (!id) return fail(400, "VALIDATION_ERROR", "id is required");

  try {
    const r = await query(
      `
      SELECT d.*, m.name AS mfg_company_name,
        COALESCE(m.sale_lock, false) AS mfg_sale_lock,
        COALESCE(m.purchase_order_lock, false) AS mfg_purchase_order_lock,
        COALESCE(m.prevent_discount, false) AS mfg_prevent_discount,
        m.credit_limit AS mfg_credit_limit
      FROM divisions d
      INNER JOIN mfg_companies m ON m.id = d.mfg_company_id AND m.account_id = d.account_id AND m.deleted_at IS NULL
      WHERE d.id = $1 AND d.account_id = $2 AND d.deleted_at IS NULL
      LIMIT 1
      `,
      [id, ctx.accountId]
    );
    const row = r.rows?.[0];
    if (!row) return fail(404, "NOT_FOUND", "Division not found.");
    return ok({ division: row });
  } catch {
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: "Please try again." });
  }
}

module.exports = { handler };
