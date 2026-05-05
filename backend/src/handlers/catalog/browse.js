const { ok, fail } = require("../../shared/response");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { query } = require("../../shared/db");
const { clean, getAccountContextForUser } = require("../orders/_common");

async function handler(event) {
  const auth = await requirePermission(event, "PURCHASE_ORDERS", "VIEW");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");
  const acct = await getAccountContextForUser(actorId);
  if (String(acct?.role_code || "").toUpperCase() !== "RETAILER") {
    return fail(403, "FORBIDDEN", "Only retailers can browse wholesaler catalogs.");
  }

  const qs = event?.queryStringParameters || {};
  const wholesalerId = clean(qs.wholesaler_id || qs.wholesalerId || qs.wholesaler_account_id || qs.wholesalerAccountId);
  const search = clean(qs.search || qs.q);
  const retailerAccountId = ctx?.accountId || null;

  const wh = ["wc.is_visible = true"];
  const ps = [];
  if (wholesalerId) {
    ps.push(wholesalerId);
    wh.push(`wc.account_id = $${ps.length}`);
  }
  if (search) {
    ps.push(`%${search}%`);
    wh.push(`(p.name ILIKE $${ps.length} OR p.code ILIKE $${ps.length} OR p.drug_name ILIKE $${ps.length})`);
  }
  const retailerParamIndex = ps.length + 1;
  ps.push(retailerAccountId);

  try {
    const r = await query(
      `
      WITH stock AS (
        SELECT account_id, product_id, COALESCE(SUM(current_stock), 0)::numeric(14,3) AS current_stock
        FROM product_batches
        WHERE deleted_at IS NULL
        GROUP BY account_id, product_id
      )
      SELECT
        wc.id,
        wc.account_id AS wholesaler_account_id,
        COALESCE(NULLIF(au.firm_name, ''), au.full_name, 'Wholesaler') AS wholesaler_name,
        au.full_name AS wholesaler_contact_name,
        au.email AS wholesaler_email,
        au.phone_country_code AS wholesaler_phone_country_code,
        au.phone_number AS wholesaler_phone_number,
        au.gst_number AS wholesaler_gst_number,
        au.address AS wholesaler_address_line1,
        NULL::text AS wholesaler_address_line2,
        au.city AS wholesaler_city,
        au.state AS wholesaler_state,
        au.pin_code AS wholesaler_pincode,
        COALESCE(l.discount_percent, 0) AS retailer_discount_percent,
        wc.product_id,
        p.code AS product_code,
        p.name AS product_name,
        p.drug_name,
        COALESCE(wc.packing, p.packing) AS packing,
        wc.catalog_price,
        wc.mrp,
        wc.min_order_qty,
        wc.max_order_qty,
        wc.catalog_notes,
        wc.hide_when_out_of_stock,
        p.sales_gst,
        COALESCE(stock.current_stock, 0) AS current_stock
      FROM wholesaler_catalog wc
      JOIN products p ON p.id = wc.product_id AND p.account_id = wc.account_id AND p.deleted_at IS NULL
      JOIN app_users au ON au.id = wc.account_id
      LEFT JOIN wholesaler_retailer_links l
        ON l.wholesaler_account_id = wc.account_id
       AND l.retailer_account_id = $${retailerParamIndex}
       AND l.status = 'ACTIVE'
      LEFT JOIN stock ON stock.account_id = wc.account_id AND stock.product_id = wc.product_id
      WHERE ${wh.join(" AND ")}
        AND (COALESCE(stock.current_stock, 0) > 0 OR wc.hide_when_out_of_stock = false)
      ORDER BY p.name ASC
      `,
      ps
    );
    return ok({ items: r.rows || [] });
  } catch {
    return fail(500, "INTERNAL_ERROR", "Failed to browse catalog.");
  }
}

module.exports = { handler };

