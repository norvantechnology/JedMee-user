const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { clean } = require("../../shared/sales");
const { resolveDateRange, applyDateRangeDate } = require("../../shared/dateFilters");

async function handler(event) {
  const auth = await requirePermission(event, "SALES_INVOICES", "VIEW");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");
  const qs = event?.queryStringParameters || {};
  const page = Math.max(1, Number(qs.page) || 1);
  const limit = Math.min(500, Math.max(1, Number(qs.limit) || 50));
  const offset = (page - 1) * limit;
  const search = clean(qs.search || qs.q);
  const status = clean(qs.status).toUpperCase();
  const paymentStatus = clean(qs.payment_status || qs.paymentStatus).toUpperCase();
  const customerId = clean(qs.customer_id || qs.customerId);
  const dateRange = resolveDateRange(qs);
  const wh = ["si.account_id = $1", "si.deleted_at IS NULL"];
  const ps = [ctx.accountId];
  if (search) {
    ps.push(`%${search}%`);
    wh.push(`(si.invoice_number ILIKE $${ps.length} OR si.customer_name ILIKE $${ps.length})`);
  }
  if (status && ["DRAFT", "CONFIRMED", "CANCELLED"].includes(status)) {
    ps.push(status);
    wh.push(`si.status = $${ps.length}::sales_invoice_status`);
  }
  if (paymentStatus && ["UNPAID", "PARTIAL", "PAID"].includes(paymentStatus)) {
    ps.push(paymentStatus);
    wh.push(`si.payment_status = $${ps.length}::sales_payment_status`);
  }
  if (customerId) {
    ps.push(customerId);
    wh.push(`si.customer_id = $${ps.length}`);
  }
  applyDateRangeDate(wh, ps, "si.invoice_date", dateRange);
  const whereSql = `WHERE ${wh.join(" AND ")}`;
  try {
    const tc = await query(`SELECT COUNT(*)::int AS c FROM sales_invoices si ${whereSql}`, ps);
    const total = Number(tc.rows?.[0]?.c || 0);
    const rs = await query(
      `SELECT si.*,
        (SELECT COUNT(*)::int FROM sales_invoice_items sii WHERE sii.sales_invoice_id = si.id) AS item_count,
        (
          SELECT CASE
            WHEN NOT EXISTS (
              SELECT 1 FROM sales_returns sr2
              WHERE sr2.sales_invoice_id = si.id AND sr2.account_id = si.account_id AND sr2.status = 'CONFIRMED'::sales_return_status
            ) THEN 'NONE'
            WHEN (
              SELECT COALESCE(SUM(sri.return_qty), 0)
              FROM sales_return_items sri
              JOIN sales_returns sr ON sr.id = sri.sales_return_id
              WHERE sr.sales_invoice_id = si.id AND sr.account_id = si.account_id AND sr.status = 'CONFIRMED'::sales_return_status
            ) >= (
              SELECT COALESCE(SUM(sii2.qty), 0)
              FROM sales_invoice_items sii2
              WHERE sii2.sales_invoice_id = si.id AND sii2.account_id = si.account_id
            ) THEN 'FULL'
            ELSE 'PARTIAL'
          END
        ) AS return_status
       FROM sales_invoices si
       ${whereSql}
       ORDER BY si.created_at DESC
       LIMIT $${ps.length + 1} OFFSET $${ps.length + 2}`,
      [...ps, limit, offset]
    );
    const totalPages = Math.max(1, Math.ceil(total / limit));
    return ok({
      items: rs.rows || [],
      pagination: { page, limit, total, total_pages: totalPages, has_next: page < totalPages, has_prev: page > 1 }
    });
  } catch {
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: "Please try again." });
  }
}

module.exports = { handler };
