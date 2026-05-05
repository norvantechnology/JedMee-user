const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { clean } = require("../../shared/purchase");
const { resolveDateRange, applyDateRangeDate } = require("../../shared/dateFilters");

async function handler(event) {
  const auth = await requirePermission(event, "DIVISION_PAYMENTS", "VIEW");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const qs = event?.queryStringParameters || {};
  const search = clean(qs.search || qs.q);
  const divisionId = clean(qs.division_id || qs.divisionId);
  const purchaseInvoiceId = clean(qs.purchase_invoice_id || qs.purchaseInvoiceId || qs.invoice_id || qs.invoiceId);
  const paymentMode = clean(qs.payment_mode || qs.paymentMode).toUpperCase();
  const dateRange = resolveDateRange(qs);
  const page = Math.max(1, Number(qs.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(qs.limit) || 50));
  const offset = (page - 1) * limit;

  const wh = ["dp.account_id = $1"];
  const ps = [ctx.accountId];
  if (divisionId) {
    ps.push(divisionId);
    wh.push(`dp.division_id = $${ps.length}`);
  }
  if (purchaseInvoiceId) {
    ps.push(purchaseInvoiceId);
    wh.push(`dp.purchase_invoice_id = $${ps.length}`);
  }
  if (paymentMode && ["CASH", "CHEQUE", "NEFT", "UPI", "CARD", "IMPS", "OTHER"].includes(paymentMode)) {
    ps.push(paymentMode);
    wh.push(`dp.payment_mode = $${ps.length}::payment_mode_type`);
  }
  applyDateRangeDate(wh, ps, "dp.payment_date", dateRange);
  if (search) {
    ps.push(`%${search}%`);
    wh.push(`(d.name ILIKE $${ps.length} OR COALESCE(pi.invoice_number,'') ILIKE $${ps.length} OR COALESCE(dp.reference_number,'') ILIKE $${ps.length})`);
  }
  const whereSql = `WHERE ${wh.join(" AND ")}`;

  try {
    const c = await query(
      `SELECT COUNT(*)::int AS c
       FROM division_payments dp
       LEFT JOIN divisions d ON d.id = dp.division_id AND d.account_id = dp.account_id
       LEFT JOIN purchase_invoices pi ON pi.id = dp.purchase_invoice_id AND pi.deleted_at IS NULL
       ${whereSql}`,
      ps
    );
    const total = Number(c.rows?.[0]?.c || 0);
    const rows = await query(
      `
      SELECT dp.*, d.name AS division_name, pi.invoice_number
      FROM division_payments dp
      LEFT JOIN divisions d ON d.id = dp.division_id AND d.account_id = dp.account_id
      LEFT JOIN purchase_invoices pi ON pi.id = dp.purchase_invoice_id AND pi.deleted_at IS NULL
      ${whereSql}
      ORDER BY dp.payment_date DESC, dp.created_at DESC
      LIMIT $${ps.length + 1} OFFSET $${ps.length + 2}
      `,
      [...ps, limit, offset]
    );
    const totalPages = Math.max(1, Math.ceil(total / limit));
    return ok({
      items: rows.rows || [],
      pagination: { page, limit, total, total_pages: totalPages, has_next: page < totalPages, has_prev: page > 1 }
    });
  } catch {
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: "Please try again." });
  }
}

module.exports = { handler };
