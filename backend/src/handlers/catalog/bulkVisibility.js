const { ok, fail } = require("../../shared/response");
const { parseJsonBody } = require("../../shared/request");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { query } = require("../../shared/db");
const { clean, getAccountContextForUser } = require("../orders/_common");

async function handler(event) {
  const auth = await requirePermission(event, "PRODUCT_BATCHES", "UPDATE");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");
  const acct = await getAccountContextForUser(actorId);
  if (String(acct?.role_code || "").toUpperCase() !== "WHOLESALER") {
    return fail(403, "FORBIDDEN", "Only wholesalers can manage catalog.");
  }

  const body = parseJsonBody(event);
  const ids = Array.isArray(body.ids) ? body.ids.map((x) => clean(x)).filter(Boolean) : [];
  const isVisible = Boolean(body.is_visible ?? body.isVisible);
  if (!ids.length) return fail(400, "VALIDATION_ERROR", "ids are required.");

  try {
    const up = await query(
      `
      UPDATE wholesaler_catalog
      SET is_visible = $3,
          updated_by_user_id = $4,
          updated_at = now()
      WHERE account_id = $1
        AND id = ANY($2::uuid[])
      RETURNING id
      `,
      [ctx.accountId, ids, isVisible, actorId]
    );
    return ok({ updated: (up.rows || []).length }, { message: "Catalog visibility updated." });
  } catch {
    return fail(500, "INTERNAL_ERROR", "Failed to update bulk visibility.");
  }
}

module.exports = { handler };

