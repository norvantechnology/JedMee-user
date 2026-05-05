const { created, fail } = require("../../shared/response");
const { parseJsonBody } = require("../../shared/request");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { query } = require("../../shared/db");
const { clean, n, round2, getAccountContextForUser } = require("../orders/_common");

async function handler(event) {
  const auth = await requirePermission(event, "PRODUCT_BATCHES", "UPDATE");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");
  const acct = await getAccountContextForUser(actorId);
  if (String(acct?.role_code || "").toUpperCase() !== "WHOLESALER") {
    return fail(403, "FORBIDDEN", "Only wholesalers can manage catalog.");
  }

  const body = parseJsonBody(event);
  const productId = clean(body.product_id || body.productId);
  const catalogPrice = n(body.catalog_price ?? body.catalogPrice);
  const mrp = clean(body.mrp) ? round2(body.mrp) : null;
  const packing = clean(body.packing) || null;
  const minOrderQty = Math.max(1, Number(body.min_order_qty ?? body.minOrderQty ?? 1) || 1);
  const maxOrderQtyRaw = clean(body.max_order_qty ?? body.maxOrderQty);
  const maxOrderQty = maxOrderQtyRaw ? Math.max(minOrderQty, Number(maxOrderQtyRaw) || minOrderQty) : null;
  const isVisible = body.is_visible === undefined && body.isVisible === undefined ? true : Boolean(body.is_visible ?? body.isVisible);
  const hideWhenOutOfStock =
    body.hide_when_out_of_stock === undefined && body.hideWhenOutOfStock === undefined ? true : Boolean(body.hide_when_out_of_stock ?? body.hideWhenOutOfStock);
  const catalogNotes = clean(body.catalog_notes || body.catalogNotes) || null;

  if (!productId) return fail(400, "VALIDATION_ERROR", "product_id is required.");
  if (!(catalogPrice > 0)) return fail(400, "VALIDATION_ERROR", "catalog_price must be greater than 0.");

  const p = await query(
    `SELECT id FROM products WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [productId, ctx.accountId]
  );
  if (!p.rows?.[0]) return fail(400, "VALIDATION_ERROR", "Product not found for this account.");

  try {
    const ins = await query(
      `
      INSERT INTO wholesaler_catalog (
        account_id, product_id, catalog_price, mrp, packing, min_order_qty, max_order_qty,
        is_visible, hide_when_out_of_stock, catalog_notes, created_by_user_id, updated_by_user_id
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
      RETURNING *
      `,
      [ctx.accountId, productId, round2(catalogPrice), mrp, packing, minOrderQty, maxOrderQty, isVisible, hideWhenOutOfStock, catalogNotes, actorId]
    );
    return created({ catalog: ins.rows?.[0] || null }, { message: "Product added to catalog." });
  } catch (e) {
    if (String(e.code || "") === "23505") return fail(409, "DUPLICATE", "Product is already in catalog.");
    return fail(500, "INTERNAL_ERROR", "Failed to add product to catalog.");
  }
}

module.exports = { handler };

