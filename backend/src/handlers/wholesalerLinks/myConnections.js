const { ok, fail } = require("../../shared/response");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { query } = require("../../shared/db");
const { getAccountContextForUser } = require("../orders/_common");

async function handler(event) {
  const auth = await requirePermission(event, "PURCHASE_ORDERS", "VIEW");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const perms = await getPermissionsForUser(actorId);
  if (!perms.accountId) return fail(400, "BAD_REQUEST", "account not found");
  const actor = await getAccountContextForUser(actorId);
  if (String(actor?.role_code || "").toUpperCase() !== "RETAILER") return fail(403, "FORBIDDEN", "Only retailer can view this list.");

  try {
    const r = await query(
      `
      SELECT
        l.*,
        COALESCE(NULLIF(w.firm_name, ''), w.full_name, 'Wholesaler') AS wholesaler_name,
        w.phone_country_code,
        w.phone_number,
        w.city,
        w.state
      FROM wholesaler_retailer_links l
      JOIN app_users w ON w.id = l.wholesaler_account_id
      WHERE l.retailer_account_id = $1
      ORDER BY l.updated_at DESC
      `,
      [perms.accountId]
    );
    return ok({ items: r.rows || [] });
  } catch {
    return fail(500, "INTERNAL_ERROR", "Failed to load connections.");
  }
}

module.exports = { handler };

