const { ok, fail } = require("../../shared/response");
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

  const id = clean(event?.pathParameters?.id);
  if (!id) return fail(400, "VALIDATION_ERROR", "catalog id is required.");
  const body = parseJsonBody(event);

  const cur = await query(`SELECT * FROM wholesaler_catalog WHERE id = $1 AND account_id = $2 LIMIT 1`, [id, ctx.accountId]);
  const row = cur.rows?.[0];
  if (!row) return fail(404, "NOT_FOUND", "Catalog item not found.");

  const catalogPrice = body.catalog_price === undefined && body.catalogPrice === undefined ? Number(row.catalog_price) : n(body.catalog_price ?? body.catalogPrice);
  if (!(catalogPrice > 0)) return fail(400, "VALIDATION_ERROR", "catalog_price must be greater than 0.");

  const minOrderQty = body.min_order_qty === undefined && body.minOrderQty === undefined ? Number(row.min_order_qty) : Math.max(1, Number(body.min_order_qty ?? body.minOrderQty) || 1);
  const maxRaw = body.max_order_qty === undefined && body.maxOrderQty === undefined ? row.max_order_qty : clean(body.max_order_qty ?? body.maxOrderQty);
  const maxOrderQty = maxRaw === "" || maxRaw === null ? null : Math.max(minOrderQty, Number(maxRaw) || minOrderQty);
  const mrp = body.mrp === undefined ? row.mrp : clean(body.mrp) ? round2(body.mrp) : null;
  const packing = body.packing === undefined ? row.packing : clean(body.packing) || null;
  const isVisible = body.is_visible === undefined && body.isVisible === undefined ? Boolean(row.is_visible) : Boolean(body.is_visible ?? body.isVisible);
  const hideWhenOutOfStock =
    body.hide_when_out_of_stock === undefined && body.hideWhenOutOfStock === undefined
      ? Boolean(row.hide_when_out_of_stock)
      : Boolean(body.hide_when_out_of_stock ?? body.hideWhenOutOfStock);
  const catalogNotes = body.catalog_notes === undefined && body.catalogNotes === undefined ? row.catalog_notes : clean(body.catalog_notes || body.catalogNotes) || null;

  try {
    const up = await query(
      `
      UPDATE wholesaler_catalog
      SET catalog_price = $3,
          mrp = $4,
          packing = $5,
          min_order_qty = $6,
          max_order_qty = $7,
          is_visible = $8,
          hide_when_out_of_stock = $9,
          catalog_notes = $10,
          updated_by_user_id = $11,
          updated_at = now()
      WHERE id = $1 AND account_id = $2
      RETURNING *
      `,
      [id, ctx.accountId, round2(catalogPrice), mrp, packing, minOrderQty, maxOrderQty, isVisible, hideWhenOutOfStock, catalogNotes, actorId]
    );
    return ok({ catalog: up.rows?.[0] || null }, { message: "Catalog item updated." });
  } catch {
    return fail(500, "INTERNAL_ERROR", "Failed to update catalog item.");
  }
}

module.exports = { handler };

