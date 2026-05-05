const { ok, fail } = require("../../shared/response");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { query } = require("../../shared/db");
const { clean, getAccountContextForUser, getAccountProfile } = require("./_common");

async function handler(event) {
  const auth = await requirePermission(event, "PURCHASE_ORDERS", "VIEW");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const perms = await getPermissionsForUser(actorId);
  if (!perms.accountId) return fail(400, "BAD_REQUEST", "account not found");
  const actor = await getAccountProfile(perms.accountId);
  if (String(actor?.role_code || "").toUpperCase() !== "WHOLESALER") {
    return fail(403, "FORBIDDEN", "Only wholesalers can view incoming orders.");
  }

  const qs = event?.queryStringParameters || {};
  const status = clean(qs.status).toUpperCase();
  const retailerId = clean(qs.retailer_account_id || qs.retailerAccountId);
  const search = clean(qs.search || qs.q);
  const page = Math.max(1, Number(qs.page || 1) || 1);
  const limit = Math.min(200, Math.max(1, Number(qs.limit || 20) || 20));
  const offset = (page - 1) * limit;

  const wh = ["wholesaler_account_id = $1"];
  const ps = [perms.accountId];
  if (status) {
    ps.push(status);
    wh.push(`status = $${ps.length}`);
  }
  if (retailerId) {
    ps.push(retailerId);
    wh.push(`retailer_account_id = $${ps.length}`);
  }
  if (search) {
    ps.push(`%${search}%`);
    wh.push(`(order_number ILIKE $${ps.length} OR retailer_firm_name ILIKE $${ps.length})`);
  }

  try {
    const totalR = await query(`SELECT COUNT(*)::int AS c FROM orders WHERE ${wh.join(" AND ")}`, ps);
    const rows = await query(
      `
      SELECT *
      FROM orders
      WHERE ${wh.join(" AND ")}
      ORDER BY placed_at DESC
      LIMIT $${ps.length + 1} OFFSET $${ps.length + 2}
      `,
      [...ps, limit, offset]
    );
    const total = Number(totalR.rows?.[0]?.c || 0);
    return ok({
      items: rows.rows || [],
      pagination: { page, limit, total, total_pages: Math.max(1, Math.ceil(total / limit)), has_next: page * limit < total, has_prev: page > 1 }
    });
  } catch {
    return fail(500, "INTERNAL_ERROR", "Failed to load incoming orders.");
  }
}

module.exports = { handler };

