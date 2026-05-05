const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");

/**
 * GET /products/rich-search?q=<text>&include_batches=true&include_suppliers=true
 *
 * Retailer counter-billing product search. Returns:
 *  - products  : up to 50 products matching `q` (name, drug_name, code,
 *                hsn_code, barcode-on-batch).
 *  - batches   : per product, all in-stock active batches ordered FIFO by
 *                expiry, with all rate columns + loose stock flag (so the
 *                frontend can apply the bill-level rate type without an extra
 *                round trip).
 *  - suppliers : per product, the vendors who have supplied it (from
 *                supplier_products) for "who can I call to restock" UX.
 *
 * Designed to drive the search popup in SalesBillingPage as well as the
 * Product-Supplier report.
 */
async function handler(event) {
  const auth = await requirePermission(event, "PRODUCT_BATCHES", "VIEW");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const qs = event?.queryStringParameters || {};
  const q = String(qs.q || "").trim();
  const includeBatches = String(qs.include_batches || qs.includeBatches || "true") !== "false";
  const includeSuppliers = String(qs.include_suppliers || qs.includeSuppliers || "false") === "true";
  const stockOnly = String(qs.stock_only || qs.stockOnly || "true") !== "false";
  const limit = Math.min(Math.max(parseInt(qs.limit, 10) || 25, 1), 100);

  const params = [ctx.accountId];
  let where = "p.account_id = $1 AND p.deleted_at IS NULL";
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    where += ` AND (
        LOWER(p.name)              LIKE $${params.length}
     OR LOWER(COALESCE(p.drug_name, '')) LIKE $${params.length}
     OR LOWER(COALESCE(p.code, ''))      LIKE $${params.length}
     OR LOWER(COALESCE(p.hsn_code, ''))  LIKE $${params.length}
     OR EXISTS (
          SELECT 1 FROM product_batches pb
          WHERE pb.product_id = p.id AND pb.account_id = p.account_id AND pb.deleted_at IS NULL
            AND LOWER(COALESCE(pb.barcode, '')) LIKE $${params.length}
        )
    )`;
  }

  try {
    const products = await query(
      `
      SELECT
        p.id, p.code, p.name, p.drug_name, p.packing, p.bulk_pack, p.case_pack,
        p.hsn_code, p.rack_location, p.is_otc, p.is_control, p.sales_gst,
        p.mfg_company_id, mc.name AS mfg_name, mc.short_name AS mfg_short
      FROM products p
      LEFT JOIN mfg_companies mc ON mc.id = p.mfg_company_id AND mc.account_id = p.account_id
      WHERE ${where}
      ORDER BY p.name ASC
      LIMIT ${limit}
      `,
      params
    );
    const productIds = (products.rows || []).map((r) => r.id);
    if (!productIds.length) {
      return ok({ products: [], batches: [], suppliers: [] });
    }

    const stockClause = stockOnly ? "AND pb.current_stock > 0" : "";

    const [batchesRes, suppliersRes] = await Promise.all([
      includeBatches
        ? query(
            `
            SELECT
              pb.id, pb.product_id, pb.batch_no, pb.expiry_date, pb.mfg_date,
              pb.mrp, pb.purchase_rate, pb.sales_rate, pb.retail_rate,
              pb.special_rate_1, pb.special_rate_2,
              pb.current_stock, pb.loose_stock, pb.loose_unit_name,
              pb.sales_gst, pb.scheme_qty_paid, pb.scheme_qty_free, pb.sales_scheme,
              pb.is_hold, pb.hold_reason, pb.barcode,
              pb.vendor_id, v.name AS supplier_name
            FROM product_batches pb
            LEFT JOIN vendors v ON v.id = pb.vendor_id AND v.account_id = pb.account_id AND v.deleted_at IS NULL
            WHERE pb.account_id = $1 AND pb.product_id = ANY($2::uuid[]) AND pb.deleted_at IS NULL
              ${stockClause}
            ORDER BY pb.expiry_date ASC NULLS LAST, pb.created_at DESC
            `,
            [ctx.accountId, productIds]
          )
        : Promise.resolve({ rows: [] }),
      includeSuppliers
        ? query(
            `
            WITH base_suppliers AS (
              SELECT
                sp.product_id,
                sp.vendor_id,
                sp.typical_purchase_rate,
                sp.is_preferred,
                sp.last_supplied_on
              FROM supplier_products sp
              WHERE sp.account_id = $1 AND sp.product_id = ANY($2::uuid[])
            )
            SELECT
              bs.product_id,
              bs.vendor_id,
              bs.typical_purchase_rate,
              bs.is_preferred,
              bs.last_supplied_on,
              v.name AS vendor_name,
              v.short_name AS vendor_short,
              v.phone_number AS vendor_phone,
              lp.last_purchase_date,
              lp.last_purchase_rate,
              lp.last_purchase_line_total,
              lp.last_purchase_invoice_total
            FROM base_suppliers bs
            JOIN vendors v ON v.id = bs.vendor_id AND v.account_id = $1 AND v.deleted_at IS NULL
            LEFT JOIN LATERAL (
              SELECT
                pi.invoice_date::date AS last_purchase_date,
                pii.purchase_rate::numeric(12,2) AS last_purchase_rate,
                (
                  (COALESCE(pii.qty, 0)::numeric * COALESCE(pii.purchase_rate, 0)::numeric)
                  - (COALESCE(pii.qty, 0)::numeric * COALESCE(pii.purchase_rate, 0)::numeric * (COALESCE(pii.discount_percent, 0)::numeric / 100))
                  + (
                      (
                        (COALESCE(pii.qty, 0)::numeric * COALESCE(pii.purchase_rate, 0)::numeric)
                        - (COALESCE(pii.qty, 0)::numeric * COALESCE(pii.purchase_rate, 0)::numeric * (COALESCE(pii.discount_percent, 0)::numeric / 100))
                      ) * (COALESCE(pii.gst_percent, 0)::numeric / 100)
                    )
                )::numeric(12,2) AS last_purchase_line_total,
                COALESCE(pi.total_amount, 0)::numeric(12,2) AS last_purchase_invoice_total
              FROM purchase_invoices pi
              JOIN purchase_invoice_items pii
                ON pii.purchase_invoice_id = pi.id
               AND pii.account_id = pi.account_id
              WHERE pi.account_id = $1
                AND pi.status = 'CONFIRMED'::purchase_invoice_status
                AND pi.deleted_at IS NULL
                AND pi.vendor_id = bs.vendor_id
                AND pii.product_id = bs.product_id
              ORDER BY pi.invoice_date DESC NULLS LAST, pi.created_at DESC NULLS LAST, pi.id DESC
              LIMIT 1
            ) lp ON true
            ORDER BY bs.is_preferred DESC, v.name ASC
            `,
            [ctx.accountId, productIds]
          )
        : Promise.resolve({ rows: [] })
    ]);

    return ok({
      products: products.rows || [],
      batches: batchesRes.rows || [],
      suppliers: suppliersRes.rows || []
    });
  } catch (e) {
    void actorId;
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: String(e.message || "Please try again.") });
  }
}

module.exports = { handler };
