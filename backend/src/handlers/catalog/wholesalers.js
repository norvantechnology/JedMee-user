const { ok, fail } = require("../../shared/response");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { query } = require("../../shared/db");
const { getAccountContextForUser } = require("../orders/_common");

async function handler(event) {
  const auth = await requirePermission(event, "PURCHASE_ORDERS", "VIEW");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");
  const acct = await getAccountContextForUser(actorId);
  if (String(acct?.role_code || "").toUpperCase() !== "RETAILER") {
    return fail(403, "FORBIDDEN", "Only retailers can browse wholesalers.");
  }

  try {
    const r = await query(
      `
      SELECT
        u.id AS wholesaler_account_id,
        COALESCE(NULLIF(u.firm_name, ''), u.full_name, 'Wholesaler') AS wholesaler_name,
        u.phone_country_code,
        u.phone_number,
        u.city,
        u.state,
        COUNT(wc.id)::int AS visible_items
      FROM wholesaler_catalog wc
      JOIN app_users u ON u.id = wc.account_id
      JOIN roles rr ON rr.id = u.role_id
      WHERE wc.is_visible = true
        AND rr.code = 'WHOLESALER'
      GROUP BY u.id, u.firm_name, u.full_name, u.phone_country_code, u.phone_number, u.city, u.state
      HAVING COUNT(wc.id) > 0
      ORDER BY wholesaler_name ASC
      `
    );
    return ok({ items: r.rows || [] });
  } catch {
    return fail(500, "INTERNAL_ERROR", "Failed to load wholesalers.");
  }
}

module.exports = { handler };

