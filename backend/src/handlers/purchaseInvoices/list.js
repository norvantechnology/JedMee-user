const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { clean } = require("../../shared/purchase");
const { resolveDateRange, applyDateRangeDate } = require("../../shared/dateFilters");

async function handler(event) {
  const auth = await requirePermission(event, "PURCHASE_INVOICES", "VIEW");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const qs = event?.queryStringParameters || {};
  const page = Math.max(1, Number(qs.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(qs.limit) || 50));
  const offset = (page - 1) * limit;
  const search = clean(qs.search || qs.q);
  const status = clean(qs.status).toUpperCase();
  const paymentStatus = clean(qs.payment_status || qs.paymentStatus).toUpperCase();
  const vendorId = clean(qs.vendor_id || qs.vendorId);
  const divisionId = clean(qs.division_id || qs.divisionId);
  const mfgCompanyId = clean(qs.mfg_company_id || qs.mfgCompanyId);
  const dateRange = resolveDateRange(qs);
  const sortBy = clean(qs.sort_by || qs.sortBy || "created_at");
  const sortOrder = clean(qs.sort_order || qs.sortOrder || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";
  const allowedSort = new Set(["created_at", "invoice_date", "invoice_number", "total_amount", "balance_due", "status", "payment_status"]);
  const ob = allowedSort.has(sortBy) ? sortBy : "created_at";

  const wh = ["pi.account_id = $1", "pi.deleted_at IS NULL"];
  const ps = [ctx.accountId];
  if (search) {
    ps.push(`%${search}%`);
    wh.push(
      `(pi.invoice_number ILIKE $${ps.length} OR pi.vendor_invoice_number ILIKE $${ps.length} OR v.name ILIKE $${ps.length} OR pi.division_name ILIKE $${ps.length} OR d.name ILIKE $${ps.length})`
    );
  }
  if (status && ["DRAFT", "CONFIRMED", "CANCELLED"].includes(status)) {
    ps.push(status);
    wh.push(`pi.status = $${ps.length}`);
  }
  if (paymentStatus && ["UNPAID", "PARTIAL", "PAID"].includes(paymentStatus)) {
    ps.push(paymentStatus);
    wh.push(`pi.payment_status = $${ps.length}`);
  }
  if (vendorId) {
    ps.push(vendorId);
    wh.push(`pi.vendor_id = $${ps.length}`);
  }
  if (divisionId) {
    ps.push(divisionId);
    wh.push(`pi.division_id = $${ps.length}`);
  }
  if (mfgCompanyId) {
    ps.push(mfgCompanyId);
    wh.push(`d.mfg_company_id = $${ps.length}`);
  }
  applyDateRangeDate(wh, ps, "pi.invoice_date", dateRange);

  try {
    const whereSql = wh.length ? `WHERE ${wh.join(" AND ")}` : "";
    const needsVendorJoinInCount = Boolean(search);
    const needsDivisionJoinInCount = Boolean(search || mfgCompanyId);
    const countJoins = [
      needsVendorJoinInCount ? "LEFT JOIN vendors v ON v.id = pi.vendor_id AND v.account_id = pi.account_id" : "",
      needsDivisionJoinInCount ? "LEFT JOIN divisions d ON d.id = pi.division_id AND d.account_id = pi.account_id AND d.deleted_at IS NULL" : ""
    ]
      .filter(Boolean)
      .join("\n");
    const totalQ = await query(
      `
      SELECT COUNT(*)::int AS c
      FROM purchase_invoices pi
      ${countJoins}
      ${whereSql}
      `,
      ps
    );
    const total = Number(totalQ.rows?.[0]?.c || 0);

    const rows = await query(
      `
      SELECT pi.*, v.name AS vendor_name, d.name AS division_label, m.name AS division_mfg_name,
        (
          SELECT CASE
            WHEN NOT EXISTS (
              SELECT 1 FROM purchase_returns pr2
              WHERE pr2.purchase_invoice_id = pi.id AND pr2.account_id = pi.account_id AND pr2.status = 'CONFIRMED'
            ) THEN 'NONE'
            WHEN (
              SELECT COALESCE(SUM(pri.return_qty), 0)
              FROM purchase_return_items pri
              JOIN purchase_returns pr ON pr.id = pri.purchase_return_id
              WHERE pr.purchase_invoice_id = pi.id AND pr.account_id = pi.account_id AND pr.status = 'CONFIRMED'
            ) >= (
              SELECT COALESCE(SUM(pii.qty), 0)
              FROM purchase_invoice_items pii
              WHERE pii.purchase_invoice_id = pi.id AND pii.account_id = pi.account_id
            ) THEN 'FULL'
            ELSE 'PARTIAL'
          END
        ) AS return_status
      FROM purchase_invoices pi
      LEFT JOIN vendors v ON v.id = pi.vendor_id AND v.account_id = pi.account_id
      LEFT JOIN divisions d ON d.id = pi.division_id AND d.account_id = pi.account_id AND d.deleted_at IS NULL
      LEFT JOIN mfg_companies m ON m.id = d.mfg_company_id AND m.account_id = pi.account_id AND m.deleted_at IS NULL
      ${whereSql}
      ORDER BY ${ob} ${sortOrder}
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
