const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");

async function handler(event) {
  const auth = await requirePermission(event, "VENDORS", "VIEW");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const qs = event?.queryStringParameters || {};
  const vendorId = String(qs.vendor_id || qs.vendorId || "").trim() || null;
  const productId = String(qs.product_id || qs.productId || "").trim() || null;

  const params = [ctx.accountId];
  let where = "sp.account_id = $1";
  if (vendorId) {
    params.push(vendorId);
    where += ` AND sp.vendor_id = $${params.length}`;
  }
  if (productId) {
    params.push(productId);
    where += ` AND sp.product_id = $${params.length}`;
  }

  try {
    const res = await query(
      `
      SELECT
        sp.id,
        sp.account_id,
        sp.vendor_id,
        sp.product_id,
        sp.typical_purchase_rate,
        sp.notes,
        sp.is_preferred,
        sp.last_supplied_on,
        sp.created_at,
        sp.updated_at,
        v.name        AS vendor_name,
        v.short_name  AS vendor_short_name,
        v.phone_number AS vendor_phone,
        v.address     AS vendor_address,
        p.code        AS product_code,
        p.name        AS product_name,
        p.drug_name   AS product_drug_name,
        p.mfg_company_id AS product_mfg_company_id,
        mc.name       AS product_mfg_name
      FROM supplier_products sp
      JOIN vendors v        ON v.id = sp.vendor_id  AND v.account_id = sp.account_id AND v.deleted_at IS NULL
      JOIN products p       ON p.id = sp.product_id AND p.account_id = sp.account_id AND p.deleted_at IS NULL
      LEFT JOIN mfg_companies mc ON mc.id = p.mfg_company_id AND mc.account_id = p.account_id
      WHERE ${where}
      ORDER BY p.name ASC, v.name ASC
      `,
      params
    );
    return ok({ supplierProducts: res.rows || [] });
  } catch (e) {
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: String(e.message || "Please try again.") });
  }
}

module.exports = { handler };
