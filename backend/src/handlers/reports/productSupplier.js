const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");

/**
 * GET /reports/product-supplier?q=<text>
 *
 * Retailer-side "Product-Supplier Detail" report (KMS Image 16). Returns:
 *   • products    : products matching q with manufacturer info
 *   • suppliers   : vendors linked to each product via supplier_products OR
 *                   confirmed purchase lines (merged; preferred + last supplied win)
 *   • batches     : live batches with stock; supplier column uses batch.vendor_id
 *                   or, if null, the vendor from the latest confirmed purchase line
 *                   for that batch.
 */
async function handler(event) {
  const auth = await requirePermission(event, "PRODUCT_BATCHES", "VIEW");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const qs = event?.queryStringParameters || {};
  const q = String(qs.q || "").trim();
  const productId = String(qs.product_id || qs.productId || "").trim() || null;
  const limit = Math.min(Math.max(parseInt(qs.limit, 10) || 50, 1), 200);

  const params = [ctx.accountId];
  let where = "p.account_id = $1 AND p.deleted_at IS NULL";
  if (productId) {
    params.push(productId);
    where += ` AND p.id = $${params.length}`;
  }
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    where += ` AND (LOWER(p.name) LIKE $${params.length} OR LOWER(COALESCE(p.drug_name,'')) LIKE $${params.length} OR LOWER(COALESCE(p.code,'')) LIKE $${params.length})`;
  }

  try {
    const summaryRes = await query(
      `
      SELECT
        (SELECT COUNT(*)::int FROM products p WHERE p.account_id = $1 AND p.deleted_at IS NULL) AS total_products,
        (SELECT COUNT(DISTINCT sp.vendor_id)::int FROM supplier_products sp WHERE sp.account_id = $1) AS active_suppliers,
        (SELECT COUNT(*)::int FROM product_batches pb
         WHERE pb.account_id = $1 AND pb.deleted_at IS NULL
           AND pb.current_stock > 0
           AND pb.expiry_date IS NOT NULL
           AND pb.expiry_date::date <= (CURRENT_DATE + INTERVAL '90 days')) AS expiring_soon_batches,
        (SELECT COUNT(*)::int FROM (
           SELECT p2.id
           FROM products p2
           LEFT JOIN product_batches pb2 ON pb2.product_id = p2.id AND pb2.account_id = p2.account_id AND pb2.deleted_at IS NULL
           WHERE p2.account_id = $1 AND p2.deleted_at IS NULL
           GROUP BY p2.id
           HAVING COALESCE(SUM(pb2.current_stock), 0) <= 0
         ) z) AS out_of_stock_products
      `,
      [ctx.accountId]
    );
    const sumRow = summaryRes.rows?.[0] || {};
    const summary = {
      total_products: Number(sumRow.total_products || 0),
      active_suppliers: Number(sumRow.active_suppliers || 0),
      expiring_soon_batches: Number(sumRow.expiring_soon_batches || 0),
      out_of_stock_products: Number(sumRow.out_of_stock_products || 0)
    };

    const products = await query(
      `
      SELECT
        p.id, p.code, p.name, p.drug_name, p.packing, p.hsn_code, p.rack_location,
        p.sales_gst, p.is_control,
        p.mfg_company_id, mc.name AS mfg_name, mc.short_name AS mfg_short,
        COALESCE(SUM(CASE WHEN pb.deleted_at IS NULL THEN pb.current_stock ELSE 0 END), 0)::numeric(12,2) AS total_stock,
        COALESCE(SUM(CASE WHEN pb.deleted_at IS NULL THEN pb.loose_stock ELSE 0 END), 0)::numeric(12,3) AS total_loose
      FROM products p
      LEFT JOIN mfg_companies mc ON mc.id = p.mfg_company_id AND mc.account_id = p.account_id
      LEFT JOIN product_batches pb ON pb.product_id = p.id AND pb.account_id = p.account_id AND pb.deleted_at IS NULL
      WHERE ${where}
      GROUP BY p.id, mc.name, mc.short_name
      ORDER BY p.name ASC
      LIMIT ${limit}
      `,
      params
    );

    const productIds = (products.rows || []).map((r) => r.id);
    if (!productIds.length) {
      return ok({ products: [], suppliers: [], batches: [], summary });
    }

    const [suppliers, batches] = await Promise.all([
      query(
        `
        WITH from_mappings AS (
          SELECT
            sp.product_id,
            sp.vendor_id,
            sp.typical_purchase_rate,
            COALESCE(sp.is_preferred, false) AS is_preferred,
            sp.last_supplied_on
          FROM supplier_products sp
          WHERE sp.account_id = $1 AND sp.product_id = ANY($2::uuid[])
        ),
        from_purchases AS (
          SELECT
            pii.product_id,
            pi.vendor_id,
            NULL::numeric(12,2) AS typical_purchase_rate,
            false AS is_preferred,
            MAX(pi.invoice_date)::date AS last_supplied_on
          FROM purchase_invoices pi
          INNER JOIN purchase_invoice_items pii
            ON pii.purchase_invoice_id = pi.id AND pii.account_id = pi.account_id
          WHERE pi.account_id = $1
            AND pi.status = 'CONFIRMED'::purchase_invoice_status
            AND pi.deleted_at IS NULL
            AND pii.product_id = ANY($2::uuid[])
          GROUP BY pii.product_id, pi.vendor_id
        ),
        combined AS (
          SELECT * FROM from_mappings
          UNION ALL
          SELECT * FROM from_purchases
        ),
        rolled AS (
          SELECT
            product_id,
            vendor_id,
            MAX(typical_purchase_rate) AS typical_purchase_rate,
            BOOL_OR(is_preferred) AS is_preferred,
            MAX(last_supplied_on) AS last_supplied_on
          FROM combined
          GROUP BY product_id, vendor_id
        )
        SELECT
          r.product_id,
          r.vendor_id,
          r.typical_purchase_rate,
          r.is_preferred,
          r.last_supplied_on,
          v.name AS vendor_name,
          v.short_name AS vendor_short,
          v.phone_number AS vendor_phone,
          v.address AS vendor_address
        FROM rolled r
        INNER JOIN vendors v ON v.id = r.vendor_id AND v.account_id = $1 AND v.deleted_at IS NULL
        ORDER BY r.is_preferred DESC, r.last_supplied_on DESC NULLS LAST, v.name ASC
        `,
        [ctx.accountId, productIds]
      ),
      query(
        `
        SELECT
          pb.id, pb.product_id, pb.batch_no, pb.expiry_date, pb.mfg_date,
          pb.mrp, pb.purchase_rate, pb.sales_rate, pb.retail_rate, pb.special_rate_1, pb.special_rate_2,
          pb.current_stock, pb.loose_stock, pb.loose_unit_name,
          pb.sales_gst, pb.scheme_qty_paid, pb.scheme_qty_free,
          pb.is_hold, pb.hold_reason, pb.vendor_id,
          COALESCE(v.name, purch.vendor_name) AS supplier_name
        FROM product_batches pb
        LEFT JOIN vendors v ON v.id = pb.vendor_id AND v.account_id = pb.account_id AND v.deleted_at IS NULL
        LEFT JOIN LATERAL (
          SELECT vsub.name AS vendor_name
          FROM purchase_invoice_items pii
          INNER JOIN purchase_invoices pi
            ON pi.id = pii.purchase_invoice_id AND pi.account_id = pii.account_id
          INNER JOIN vendors vsub
            ON vsub.id = pi.vendor_id AND vsub.account_id = pi.account_id AND vsub.deleted_at IS NULL
          WHERE pii.account_id = pb.account_id
            AND (pii.batch_id = pb.id OR pii.confirmed_batch_id = pb.id)
            AND pi.status = 'CONFIRMED'::purchase_invoice_status
            AND pi.deleted_at IS NULL
          ORDER BY pi.invoice_date DESC NULLS LAST, pi.id DESC
          LIMIT 1
        ) purch ON true
        WHERE pb.account_id = $1 AND pb.product_id = ANY($2::uuid[]) AND pb.deleted_at IS NULL
        ORDER BY pb.expiry_date ASC NULLS LAST, pb.created_at DESC
        `,
        [ctx.accountId, productIds]
      )
    ]);

    return ok({
      products: products.rows || [],
      suppliers: suppliers.rows || [],
      batches: batches.rows || [],
      summary
    });
  } catch (e) {
    void actorId;
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: String(e.message || "Please try again.") });
  }
}

module.exports = { handler };
