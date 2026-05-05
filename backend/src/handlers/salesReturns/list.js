const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { clean } = require("../../shared/sales");
const { resolveDateRange, applyDateRangeDate } = require("../../shared/dateFilters");

async function handler(event) {
  const auth = await requirePermission(event, "SALES_RETURNS", "VIEW");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");
  const qs = event?.queryStringParameters || {};
  const page = Math.max(1, Number(qs.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(qs.limit) || 50));
  const offset = (page - 1) * limit;
  const qText = clean(qs.q || qs.search);
  const status = clean(qs.status).toUpperCase();
  const customerId = clean(qs.customerId || qs.customer_id);
  const dateRange = resolveDateRange(qs);
  const wh = ["account_id = $1"];
  const ps = [ctx.accountId];
  if (qText) {
    ps.push(`%${qText}%`);
    wh.push(`(return_number ILIKE $${ps.length} OR customer_name ILIKE $${ps.length})`);
  }
  if (status) {
    ps.push(status);
    wh.push(`status = $${ps.length}::sales_return_status`);
  }
  if (customerId) {
    ps.push(customerId);
    wh.push(`customer_id = $${ps.length}`);
  }
  applyDateRangeDate(wh, ps, "return_date", dateRange);
  const whereSql = `WHERE ${wh.join(" AND ")}`;
  try {
    const tc = await query(`SELECT COUNT(*)::int AS c FROM sales_returns ${whereSql}`, ps);
    const total = Number(tc.rows?.[0]?.c || 0);
    const rs = await query(
      `SELECT * FROM sales_returns ${whereSql} ORDER BY created_at DESC LIMIT $${ps.length + 1} OFFSET $${ps.length + 2}`,
      [...ps, limit, offset]
    );
    const totalPages = Math.max(1, Math.ceil(total / limit));
    return ok({ items: rs.rows || [], pagination: { page, limit, total, total_pages: totalPages, has_next: page < totalPages, has_prev: page > 1 } });
  } catch {
    return fail(500, "INTERNAL_ERROR", "Something went wrong.");
  }
}

module.exports = { handler };
