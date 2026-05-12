const { ok, fail } = require("../../shared/response");
const { parseJsonBody } = require("../../shared/request");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");

function clean(v) {
  return String(v ?? "").trim();
}

function num(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function handler(event) {
  const auth = await requirePermission(event, "VENDORS", "UPDATE");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const body = parseJsonBody(event);
  const vendorId     = clean(body.vendorId     || body.vendor_id);
  const productId    = clean(body.productId    || body.product_id);
  const divisionId   = clean(body.divisionId   || body.division_id)   || null;
  const mfgCompanyId = clean(body.mfgCompanyId || body.mfg_company_id) || null;

  if (!vendorId)  return fail(400, "VALIDATION_ERROR", "vendorId is required.");
  if (!productId) return fail(400, "VALIDATION_ERROR", "productId is required.");

  const typicalRate = num(body.typicalPurchaseRate ?? body.typical_purchase_rate);
  const notes       = clean(body.notes) || null;
  const isPreferred = body.isPreferred === undefined ? null : Boolean(body.isPreferred);

  try {
    // Validate vendor
    const v = await query(
      `SELECT id FROM vendors WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1`,
      [vendorId, ctx.accountId]
    );
    if (!v.rows?.[0]) return fail(404, "NOT_FOUND", "Vendor not found.");

    // Validate product and auto-resolve division/mfg if not supplied
    const p = await query(
      `SELECT id, division_id, mfg_company_id FROM products WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1`,
      [productId, ctx.accountId]
    );
    if (!p.rows?.[0]) return fail(404, "NOT_FOUND", "Product not found.");

    const product = p.rows[0];
    // Use caller-supplied values; fall back to what the product already knows.
    const resolvedDivisionId   = divisionId   || product.division_id   || null;
    const resolvedMfgCompanyId = mfgCompanyId || product.mfg_company_id || null;

    // If marking this vendor as preferred, clear the preferred flag on all
    // other supplier_products rows for the same product first.
    if (isPreferred === true) {
      await query(
        `UPDATE supplier_products
            SET is_preferred = false, updated_at = now()
          WHERE account_id = $1
            AND product_id = $2
            AND vendor_id  <> $3
            AND is_preferred = true`,
        [ctx.accountId, productId, vendorId]
      );
    }

    const res = await query(
      `
      INSERT INTO supplier_products
        (account_id, vendor_id, product_id, division_id, mfg_company_id,
         typical_purchase_rate, notes, is_preferred, created_by_user_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, false), $9)
      ON CONFLICT (account_id, vendor_id, product_id) DO UPDATE
        SET typical_purchase_rate = COALESCE(EXCLUDED.typical_purchase_rate, supplier_products.typical_purchase_rate),
            notes                 = COALESCE(EXCLUDED.notes,                 supplier_products.notes),
            is_preferred          = COALESCE($8,                             supplier_products.is_preferred),
            division_id           = COALESCE(EXCLUDED.division_id,           supplier_products.division_id),
            mfg_company_id        = COALESCE(EXCLUDED.mfg_company_id,        supplier_products.mfg_company_id),
            updated_at            = now()
      RETURNING *
      `,
      [ctx.accountId, vendorId, productId, resolvedDivisionId, resolvedMfgCompanyId,
       typicalRate, notes, isPreferred, actorId]
    );
    return ok({ supplierProduct: res.rows?.[0] || null });
  } catch (e) {
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: String(e.message || "Please try again.") });
  }
}

module.exports = { handler };
