const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { clean } = require("../../shared/purchase");
const { resolveDateRange, applyDateRangeDate } = require("../../shared/dateFilters");

async function handler(event) {
  const auth = await requirePermission(event, "VENDOR_PAYMENTS", "VIEW");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const qs = event?.queryStringParameters || {};
  const search = clean(qs.search || qs.q);
  const vendorId = clean(qs.vendor_id || qs.vendorId);
  const purchaseInvoiceId = clean(qs.purchase_invoice_id || qs.purchaseInvoiceId || qs.invoice_id || qs.invoiceId);
  const paymentMode = clean(qs.payment_mode || qs.paymentMode).toUpperCase();
  const allocationType = clean(qs.allocation_type || qs.allocationType).toUpperCase();
  const dateRange = resolveDateRange(qs);
  const page = Math.max(1, Number(qs.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(qs.limit) || 50));
  const offset = (page - 1) * limit;

  const wh = ["vp.account_id = $1"];
  const ps = [ctx.accountId];
  if (vendorId) {
    ps.push(vendorId);
    wh.push(`vp.vendor_id = $${ps.length}`);
  }
  if (purchaseInvoiceId) {
    ps.push(purchaseInvoiceId);
    wh.push(`vp.purchase_invoice_id = $${ps.length}`);
  }
  if (paymentMode && ["CASH", "CHEQUE", "NEFT", "UPI", "CARD", "IMPS", "OTHER"].includes(paymentMode)) {
    ps.push(paymentMode);
    wh.push(`vp.payment_mode = $${ps.length}::payment_mode_type`);
  }
  if (allocationType && ["INVOICE", "ON_ACCOUNT"].includes(allocationType)) {
    ps.push(allocationType);
    wh.push(`COALESCE(vp.allocation_type, CASE WHEN vp.purchase_invoice_id IS NULL THEN 'ON_ACCOUNT' ELSE 'INVOICE' END) = $${ps.length}`);
  }
  applyDateRangeDate(wh, ps, "vp.payment_date", dateRange);
  if (search) {
    ps.push(`%${search}%`);
    wh.push(`(v.name ILIKE $${ps.length} OR COALESCE(pi.invoice_number,'') ILIKE $${ps.length} OR COALESCE(vp.reference_number,'') ILIKE $${ps.length})`);
  }
  const whereSql = `WHERE ${wh.join(" AND ")}`;

  try {
    const c = await query(
      `SELECT COUNT(*)::int AS c
       FROM vendor_payments vp
       LEFT JOIN vendors v ON v.id = vp.vendor_id
       LEFT JOIN purchase_invoices pi ON pi.id = vp.purchase_invoice_id AND pi.deleted_at IS NULL
       ${whereSql}`,
      ps
    );
    const total = Number(c.rows?.[0]?.c || 0);
    const rows = await query(
      `
      SELECT vp.*, v.name AS vendor_name, pi.invoice_number,
             COALESCE(vp.allocation_type, CASE WHEN vp.purchase_invoice_id IS NULL THEN 'ON_ACCOUNT' ELSE 'INVOICE' END) AS allocation_type_resolved
      FROM vendor_payments vp
      LEFT JOIN vendors v ON v.id = vp.vendor_id
      LEFT JOIN purchase_invoices pi ON pi.id = vp.purchase_invoice_id AND pi.deleted_at IS NULL
      ${whereSql}
      ORDER BY vp.payment_date DESC, vp.created_at DESC
      LIMIT $${ps.length + 1} OFFSET $${ps.length + 2}
      `,
      [...ps, limit, offset]
    );
    const totalPages = Math.max(1, Math.ceil(total / limit));
    return ok({
      items: rows.rows || [],
      pagination: {
        page,
        limit,
        total,
        total_pages: totalPages,
        has_next: page < totalPages,
        has_prev: page > 1
      }
    });
  } catch {
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: "Please try again." });
  }
}

module.exports = { handler };
