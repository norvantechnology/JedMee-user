const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");

/**
 * GET /reports/mfg-stockist?q=<text>
 *
 * Retailer-side "Manufacturer → Stockist" report (KMS Image 17/18). Returns:
 *   • manufacturers : list of mfg_companies (filterable by name/code)
 *   • stockists     : per manufacturer → vendors who supply that manufacturer's
 *                     products from supplier_products, vendor_manufacturers, and
 *                     confirmed purchase invoices (so history shows even if mapping
 *                     rows were missing).
 *                     last_supplied_on = latest of supplier_products.last_supplied_on
 *                     and MAX(purchase_invoices.invoice_date) for that vendor+mfg (ISO date
 *                     string from DB  reflects whatever dates were entered on invoices).
 *
 * Permission: MFG_COMPANIES.VIEW or PRODUCT_BATCHES.VIEW (matches UI gate for retailers).
 */
async function handler(event) {
  let auth = await requirePermission(event, "MFG_COMPANIES", "VIEW");
  if (!auth.ok) {
    auth = await requirePermission(event, "PRODUCT_BATCHES", "VIEW");
  }
  if (!auth.ok) return auth.resp;

  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const qs = event?.queryStringParameters || {};
  const q = String(qs.q || "").trim();
  const params = [ctx.accountId];
  let where = "mc.account_id = $1";
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    where += ` AND (LOWER(mc.name) LIKE $${params.length} OR LOWER(COALESCE(mc.code,'')) LIKE $${params.length} OR LOWER(COALESCE(mc.short_name,'')) LIKE $${params.length})`;
  }

  try {
    const mfgs = await query(
      `
      SELECT mc.id, mc.code, mc.name, mc.short_name
      FROM mfg_companies mc
      WHERE ${where}
      ORDER BY mc.name ASC
      LIMIT 200
      `,
      params
    );

    const mfgIds = (mfgs.rows || []).map((r) => r.id);
    if (!mfgIds.length) {
      return ok({ manufacturers: [], stockists: [] });
    }

    const stockists = await query(
      `
      WITH derived AS (
        SELECT DISTINCT
          p.mfg_company_id, sp.vendor_id, MAX(sp.last_supplied_on) AS last_supplied_on
        FROM supplier_products sp
        JOIN products p ON p.id = sp.product_id AND p.account_id = sp.account_id
        WHERE sp.account_id = $1 AND p.mfg_company_id = ANY($2::uuid[])
        GROUP BY p.mfg_company_id, sp.vendor_id
      ),
      explicit AS (
        SELECT DISTINCT vm.mfg_company_id, vm.vendor_id, NULL::date AS last_supplied_on
        FROM vendor_manufacturers vm
        WHERE vm.account_id = $1 AND vm.mfg_company_id = ANY($2::uuid[])
      ),
      from_confirmations AS (
        SELECT
          COALESCE(pii.mfg_company_id, p.mfg_company_id) AS mfg_company_id,
          pi.vendor_id,
          MAX(pi.invoice_date)::date AS last_supplied_on
        FROM purchase_invoices pi
        INNER JOIN purchase_invoice_items pii
          ON pii.purchase_invoice_id = pi.id AND pii.account_id = pi.account_id
        INNER JOIN products p ON p.id = pii.product_id AND p.account_id = pi.account_id AND p.deleted_at IS NULL
        WHERE pi.account_id = $1
          AND pi.status = 'CONFIRMED'::purchase_invoice_status
          AND pi.deleted_at IS NULL
          AND COALESCE(pii.mfg_company_id, p.mfg_company_id) IS NOT NULL
          AND COALESCE(pii.mfg_company_id, p.mfg_company_id) = ANY($2::uuid[])
        GROUP BY COALESCE(pii.mfg_company_id, p.mfg_company_id), pi.vendor_id
      ),
      combined AS (
        SELECT * FROM derived
        UNION
        SELECT * FROM explicit
        UNION
        SELECT * FROM from_confirmations
      )
      SELECT c.mfg_company_id, c.vendor_id, MAX(c.last_supplied_on) AS last_supplied_on,
             v.name AS vendor_name, v.short_name AS vendor_short, v.phone_number AS vendor_phone, v.address AS vendor_address
      FROM combined c
      JOIN vendors v ON v.id = c.vendor_id AND v.account_id = $1 AND v.deleted_at IS NULL
      GROUP BY c.mfg_company_id, c.vendor_id, v.name, v.short_name, v.phone_number, v.address
      ORDER BY last_supplied_on DESC NULLS LAST, v.name ASC
      `,
      [ctx.accountId, mfgIds]
    );

    return ok({ manufacturers: mfgs.rows || [], stockists: stockists.rows || [] });
  } catch (e) {
    void actorId;
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: String(e.message || "Please try again.") });
  }
}

module.exports = { handler };
