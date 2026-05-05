const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { clean } = require("../../shared/sales");
const { getRoleCodeForAccount } = require("../../shared/accountRoleProfile");
const { hasColumn } = require("../../shared/schemaSupport");
const { resolveDateRange, applyDateRangeDate } = require("../../shared/dateFilters");

async function handler(event) {
  const auth = await requirePermission(event, "CUSTOMER_PAYMENTS", "VIEW");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");
  const qs = event?.queryStringParameters || {};
  const search = clean(qs.search || qs.q);
  const customerId = clean(qs.customer_id || qs.customerId);
  const invoiceId = clean(qs.sales_invoice_id || qs.salesInvoiceId || qs.invoice_id || qs.invoiceId);
  const paymentMode = clean(qs.payment_mode || qs.paymentMode).toUpperCase();
  const dateRange = resolveDateRange(qs);
  const page = Math.max(1, Number(qs.page) || 1);
  const limit = Math.min(500, Math.max(1, Number(qs.limit) || 50));
  const offset = (page - 1) * limit;
  const roleCode = await getRoleCodeForAccount(ctx.accountId);
  const supportsWalkInColumn = await hasColumn("customers", "is_walk_in");
  const excludeWalkInParam = clean(qs.exclude_walk_in || qs.excludeWalkIn).toLowerCase();
  const excludeWalkIn = excludeWalkInParam ? ["1", "true", "yes"].includes(excludeWalkInParam) : roleCode === "RETAILER";
  const wh = ["cp.account_id = $1"];
  const ps = [ctx.accountId];
  if (customerId) {
    ps.push(customerId);
    wh.push(`cp.customer_id = $${ps.length}`);
  }
  if (invoiceId) {
    ps.push(invoiceId);
    wh.push(`cp.sales_invoice_id = $${ps.length}`);
  }
  if (paymentMode && ["CASH", "CHEQUE", "NEFT", "UPI", "CARD", "OTHER"].includes(paymentMode)) {
    ps.push(paymentMode);
    wh.push(`cp.payment_mode = $${ps.length}::customer_payment_mode_type`);
  }
  applyDateRangeDate(wh, ps, "cp.payment_date", dateRange);
  if (search) {
    ps.push(`%${search}%`);
    wh.push(`(c.name ILIKE $${ps.length} OR COALESCE(si.invoice_number,'') ILIKE $${ps.length} OR COALESCE(cp.reference_number,'') ILIKE $${ps.length})`);
  }
  if (excludeWalkIn && supportsWalkInColumn) {
    wh.push(`COALESCE(c.is_walk_in, false) = false`);
  }
  try {
    const tc = await query(
      `SELECT COUNT(*)::int AS c
       FROM customer_payments cp
       LEFT JOIN customers c ON c.id = cp.customer_id
       LEFT JOIN sales_invoices si ON si.id = cp.sales_invoice_id
       WHERE ${wh.join(" AND ")}`,
      ps
    );
    const total = Number(tc.rows?.[0]?.c || 0);
    const rs = await query(
      `SELECT
         cp.*,
         c.name AS customer_name,
         si.invoice_number,
         CASE WHEN cp.sales_invoice_id IS NULL THEN 'ON_ACCOUNT' ELSE 'INVOICE' END AS allocation_type_resolved
       FROM customer_payments cp
       LEFT JOIN customers c ON c.id = cp.customer_id
       LEFT JOIN sales_invoices si ON si.id = cp.sales_invoice_id
       WHERE ${wh.join(" AND ")}
       ORDER BY cp.payment_date DESC, cp.created_at DESC
       LIMIT $${ps.length + 1} OFFSET $${ps.length + 2}`,
      [...ps, limit, offset]
    );
    const totalPages = Math.max(1, Math.ceil(total / limit));
    return ok({
      items: rs.rows || [],
      pagination: { page, limit, total, total_pages: totalPages, has_next: page < totalPages, has_prev: page > 1 }
    });
  } catch (e) {
    console.error("customerPayments.list failed", e);
    return fail(500, "INTERNAL_ERROR", "Something went wrong.");
  }
}

module.exports = { handler };
