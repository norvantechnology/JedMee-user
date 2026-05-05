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
  const vendorId = clean(body.vendorId || body.vendor_id);
  const productId = clean(body.productId || body.product_id);
  if (!vendorId) return fail(400, "VALIDATION_ERROR", "vendorId is required.");
  if (!productId) return fail(400, "VALIDATION_ERROR", "productId is required.");

  const typicalRate = num(body.typicalPurchaseRate ?? body.typical_purchase_rate);
  const notes = clean(body.notes) || null;
  const isPreferred = body.isPreferred === undefined ? null : Boolean(body.isPreferred);

  try {
    const v = await query(
      `SELECT id FROM vendors WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1`,
      [vendorId, ctx.accountId]
    );
    if (!v.rows?.[0]) return fail(404, "NOT_FOUND", "Vendor not found.");

    const p = await query(
      `SELECT id FROM products WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1`,
      [productId, ctx.accountId]
    );
    if (!p.rows?.[0]) return fail(404, "NOT_FOUND", "Product not found.");

    const res = await query(
      `
      INSERT INTO supplier_products (account_id, vendor_id, product_id, typical_purchase_rate, notes, is_preferred, created_by_user_id)
      VALUES ($1, $2, $3, $4, $5, COALESCE($6, false), $7)
      ON CONFLICT (account_id, vendor_id, product_id) DO UPDATE
        SET typical_purchase_rate = COALESCE(EXCLUDED.typical_purchase_rate, supplier_products.typical_purchase_rate),
            notes                 = COALESCE(EXCLUDED.notes, supplier_products.notes),
            is_preferred          = COALESCE($6, supplier_products.is_preferred),
            updated_at            = now()
      RETURNING *
      `,
      [ctx.accountId, vendorId, productId, typicalRate, notes, isPreferred, actorId]
    );
    return ok({ supplierProduct: res.rows?.[0] || null });
  } catch (e) {
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: String(e.message || "Please try again.") });
  }
}

module.exports = { handler };
