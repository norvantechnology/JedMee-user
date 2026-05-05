const { ok, fail } = require("../../shared/response");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { query } = require("../../shared/db");
const { clean, getAccountContextForUser } = require("../orders/_common");

async function handler(event) {
  const auth = await requirePermission(event, "PRODUCT_BATCHES", "DELETE");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");
  const acct = await getAccountContextForUser(actorId);
  if (String(acct?.role_code || "").toUpperCase() !== "WHOLESALER") {
    return fail(403, "FORBIDDEN", "Only wholesalers can manage catalog.");
  }

  const id = clean(event?.pathParameters?.id);
  if (!id) return fail(400, "VALIDATION_ERROR", "catalog id is required.");

  const activeRef = await query(
    `
    SELECT COUNT(*)::int AS c
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE oi.catalog_id = $1
      AND o.wholesaler_account_id = $2
      AND o.status IN ('PENDING', 'ACCEPTED')
    `,
    [id, ctx.accountId]
  );
  if (Number(activeRef.rows?.[0]?.c || 0) > 0) {
    return fail(409, "CONFLICT", "Catalog item is referenced by active orders.");
  }

  try {
    const up = await query(
      `
      UPDATE wholesaler_catalog
      SET is_visible = false,
          updated_by_user_id = $3,
          updated_at = now()
      WHERE id = $1 AND account_id = $2
      RETURNING id
      `,
      [id, ctx.accountId, actorId]
    );
    if (!up.rows?.[0]) return fail(404, "NOT_FOUND", "Catalog item not found.");
    return ok({ id }, { message: "Catalog item hidden." });
  } catch {
    return fail(500, "INTERNAL_ERROR", "Failed to update catalog visibility.");
  }
}

module.exports = { handler };

