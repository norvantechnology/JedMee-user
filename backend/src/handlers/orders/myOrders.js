const { ok, fail } = require("../../shared/response");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { query } = require("../../shared/db");
const { clean } = require("./_common");

async function handler(event) {
  const auth = await requirePermission(event, "PURCHASE_ORDERS", "VIEW");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const perms = await getPermissionsForUser(actorId);
  if (!perms.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const qs = event?.queryStringParameters || {};
  const status = clean(qs.status).toUpperCase();
  const wholesalerId = clean(qs.wholesaler_account_id || qs.wholesalerAccountId);
  const search = clean(qs.search || qs.q);
  const page = Math.max(1, Number(qs.page || 1) || 1);
  const limit = Math.min(200, Math.max(1, Number(qs.limit || 20) || 20));
  const offset = (page - 1) * limit;

  const wh = ["retailer_account_id = $1"];
  const ps = [perms.accountId];
  if (status) {
    ps.push(status);
    wh.push(`status = $${ps.length}`);
  }
  if (wholesalerId) {
    ps.push(wholesalerId);
    wh.push(`wholesaler_account_id = $${ps.length}`);
  }
  if (search) {
    ps.push(`%${search}%`);
    wh.push(`(order_number ILIKE $${ps.length} OR wholesaler_firm_name ILIKE $${ps.length})`);
  }
  const whSql = wh
    .map((x) =>
      x
        .replace("retailer_account_id", "o.retailer_account_id")
        .replace("status =", "o.status =")
        .replace("wholesaler_account_id", "o.wholesaler_account_id")
        .replace("order_number", "o.order_number")
        .replace("wholesaler_firm_name", "o.wholesaler_firm_name")
    )
    .join(" AND ");

  try {
    await query(
      `
      UPDATE orders o
      SET status = 'CANCELLED',
          cancellation_reason = 'Auto-cancelled: wholesaler unavailable > 7 days',
          cancelled_at = now(),
          updated_at = now()
      FROM app_users w
      WHERE o.wholesaler_account_id = w.id
        AND o.retailer_account_id = $1
        AND o.status = 'PENDING'
        AND o.placed_at <= now() - INTERVAL '7 days'
        AND (w.is_blocked = true OR UPPER(COALESCE(w.status, '')) IN ('PENDING', 'REJECTED'))
      `,
      [perms.accountId]
    );

    const totalR = await query(`SELECT COUNT(*)::int AS c FROM orders WHERE ${wh.join(" AND ")}`, ps);
    const rows = await query(
      `
      SELECT
        o.*,
        (SELECT COUNT(*)::int FROM order_items oi WHERE oi.order_id = o.id) AS item_count,
        (w.is_blocked = true OR UPPER(COALESCE(w.status, '')) IN ('PENDING', 'REJECTED')) AS wholesaler_unavailable
      FROM orders o
      JOIN app_users w ON w.id = o.wholesaler_account_id
      WHERE ${whSql}
      ORDER BY o.placed_at DESC
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
    return fail(500, "INTERNAL_ERROR", "Failed to load orders.");
  }
}

module.exports = { handler };

