const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");

/**
 * GET /reports/sales-stock-analysis?from_date=YYYY-MM-DD&to_date=YYYY-MM-DD&search=&limit=500
 *
 * Sales & Stock Analysis Report.
 * For each product (aggregated across all batches) returns:
 *   - qty_sold      : total strip-equivalent units sold (confirmed invoices) in the date range
 *   - loose_sold    : total loose units sold in the date range
 *   - current_stock : total current strip stock across all active batches
 *   - loose_stock   : total current loose stock across all active batches
 *   - revenue       : total taxable_amount for the product in the date range
 *
 * Also returns summary totals.
 */
async function handler(event) {
  const auth = await requirePermission(event, "SALES_INVOICES", "VIEW");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const qs = event?.queryStringParameters || {};

  // Date range — default to current month if not provided
  const today = new Date();
  const defaultFrom = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
  const defaultTo   = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const fromDate = /^\d{4}-\d{2}-\d{2}$/.test(qs.from_date || "") ? qs.from_date : defaultFrom;
  const toDate   = /^\d{4}-\d{2}-\d{2}$/.test(qs.to_date   || "") ? qs.to_date   : defaultTo;

  const limit = Math.min(Math.max(parseInt(qs.limit, 10) || 500, 1), 2000);

  try {
    // ── 1. Sales aggregated per product in the date range ──────────────────
    const salesRes = await query(
      `
      SELECT
        p.id                                                          AS product_id,
        p.code                                                        AS product_code,
        p.name                                                        AS product_name,
        p.drug_name,
        mc.name                                                       AS mfg_name,
        COALESCE(SUM(sii.qty),       0)::numeric(14,2)               AS qty_sold,
        COALESCE(SUM(sii.loose_qty), 0)::numeric(14,2)               AS loose_sold,
        COALESCE(SUM(sii.taxable_amount), 0)::numeric(14,2)          AS revenue,
        COUNT(DISTINCT si.id)::int                                    AS invoice_count
      FROM sales_invoice_items sii
      JOIN sales_invoices si
        ON si.id = sii.sales_invoice_id
       AND si.account_id = sii.account_id
       AND si.deleted_at IS NULL
       AND si.status = 'CONFIRMED'
       AND si.invoice_date BETWEEN $2 AND $3
      JOIN product_batches pb
        ON pb.id = sii.batch_id
       AND pb.account_id = sii.account_id
      JOIN products p
        ON p.id = pb.product_id
       AND p.account_id = pb.account_id
      LEFT JOIN mfg_companies mc
        ON mc.id = p.mfg_company_id
       AND mc.account_id = p.account_id
      WHERE sii.account_id = $1
      GROUP BY p.id, p.code, p.name, p.drug_name, mc.name
      ORDER BY qty_sold DESC, revenue DESC
      LIMIT ${limit}
      `,
      [ctx.accountId, fromDate, toDate]
    );

    // ── 2. Current stock per product (all active batches) ──────────────────
    const stockRes = await query(
      `
      SELECT
        p.id                                          AS product_id,
        COALESCE(SUM(pb.current_stock), 0)::numeric  AS current_stock,
        COALESCE(SUM(pb.loose_stock),   0)::numeric  AS loose_stock,
        COUNT(pb.id)::int                             AS batch_count
      FROM product_batches pb
      JOIN products p
        ON p.id = pb.product_id
       AND p.account_id = pb.account_id
      WHERE pb.account_id = $1
        AND pb.deleted_at IS NULL
        AND pb.current_stock >= 0
      GROUP BY p.id
      `,
      [ctx.accountId]
    );

    // ── 3. Merge sales + stock by product_id ──────────────────────────────
    const stockMap = Object.create(null);
    for (const row of stockRes.rows) {
      stockMap[row.product_id] = {
        current_stock: Number(row.current_stock),
        loose_stock:   Number(row.loose_stock),
        batch_count:   Number(row.batch_count),
      };
    }

    const items = salesRes.rows.map((r) => {
      const s = stockMap[r.product_id] || { current_stock: 0, loose_stock: 0, batch_count: 0 };
      return {
        product_id:    r.product_id,
        product_code:  r.product_code,
        product_name:  r.product_name,
        drug_name:     r.drug_name,
        mfg_name:      r.mfg_name,
        qty_sold:      Number(r.qty_sold),
        loose_sold:    Number(r.loose_sold),
        revenue:       Number(r.revenue),
        invoice_count: Number(r.invoice_count),
        current_stock: s.current_stock,
        loose_stock:   s.loose_stock,
        batch_count:   s.batch_count,
      };
    });

    // ── 4. Summary totals ─────────────────────────────────────────────────
    const totalQtySold    = items.reduce((a, r) => a + r.qty_sold,      0);
    const totalLooseSold  = items.reduce((a, r) => a + r.loose_sold,    0);
    const totalRevenue    = items.reduce((a, r) => a + r.revenue,       0);
    const totalStock      = items.reduce((a, r) => a + r.current_stock, 0);
    const totalLooseStock = items.reduce((a, r) => a + r.loose_stock,   0);

    return ok({
      from_date: fromDate,
      to_date:   toDate,
      items,
      summary: {
        total_products:    items.length,
        total_qty_sold:    Math.round(totalQtySold    * 100) / 100,
        total_loose_sold:  Math.round(totalLooseSold  * 100) / 100,
        total_revenue:     Math.round(totalRevenue    * 100) / 100,
        total_stock:       Math.round(totalStock      * 100) / 100,
        total_loose_stock: Math.round(totalLooseStock * 100) / 100,
      },
    });
  } catch (e) {
    void actorId;
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", {
      subMessage: String(e.message || "Please try again."),
    });
  }
}

module.exports = { handler };