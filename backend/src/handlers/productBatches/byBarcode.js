const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requireApprovedUser } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");

function clean(v) {
  return String(v ?? "").trim();
}

async function handler(event) {
  const auth = await requireApprovedUser(event);
  if (!auth.ok) return auth.resp;

  const actorId = String(auth.claims?.sub || "");
  const permCtx = await getPermissionsForUser(actorId);
  if (!permCtx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const isOwner = Boolean(permCtx.isAccountOwner);
  const perms = permCtx.permissions || {};
  const canViewBatches = isOwner || Boolean(perms?.PRODUCT_BATCHES?.VIEW);
  const canUseSales =
    isOwner ||
    Boolean(perms?.SALES_INVOICES?.VIEW || perms?.SALES_INVOICES?.ADD || perms?.SALES_INVOICES?.UPDATE);
  const canUsePurchase =
    isOwner ||
    Boolean(
      perms?.PURCHASE_INVOICES?.VIEW || perms?.PURCHASE_INVOICES?.ADD || perms?.PURCHASE_INVOICES?.UPDATE
    );
  if (!canViewBatches && !canUseSales && !canUsePurchase) {
    return fail(403, "FORBIDDEN", "You do not have permission to look up barcodes");
  }

  const qs = event?.queryStringParameters || {};
  const barcode = clean(qs.barcode);
  if (!barcode) return fail(400, "VALIDATION_ERROR", "barcode is required");

  try {
    const rs = await query(
      `SELECT
         pb.id,
         pb.id AS batch_id,
         pb.barcode,
         pb.product_id,
         pb.product_code,
         pb.product_name,
         pb.batch_no,
         pb.expiry_date,
         pb.mrp,
         pb.purchase_rate,
         pb.sales_rate,
         pb.retail_rate,
         pb.special_rate_1,
         pb.special_rate_2,
         COALESCE(p.sales_gst, pb.sales_gst) AS sales_gst,
         pb.is_hold,
         pb.hold_reason,
         COALESCE(p.is_control, pb.is_control) AS is_control,
         COALESCE(p.is_half_scheme, pb.is_half_scheme) AS is_half_scheme,
         pb.is_net,
         pb.net_discount_percent,
         pb.is_non_editable_free_qty,
         COALESCE(p.scheme_qty_paid, pb.scheme_qty_paid) AS scheme_qty_paid,
         COALESCE(p.scheme_qty_free, pb.scheme_qty_free) AS scheme_qty_free,
         COALESCE(st.qty, 0)::numeric(12,3) AS stock_billable_qty,
         COALESCE(st.free_qty, 0)::numeric(12,3) AS stock_free_qty,
         COALESCE(mc.name, '') AS mfg_company_name,
         COALESCE(mc.sale_lock, false) AS sale_lock,
         COALESCE(mc.prevent_free_qty, false) AS prevent_free_qty,
         COALESCE(mc.prevent_discount, false) AS prevent_discount,
         COALESCE(mc.prevent_net_rate, false) AS prevent_net_rate
       FROM product_batches pb
       JOIN products p ON p.id = pb.product_id AND p.account_id = pb.account_id
       LEFT JOIN mfg_companies mc ON mc.id = p.mfg_company_id AND mc.account_id = p.account_id AND mc.deleted_at IS NULL
       LEFT JOIN LATERAL (
         SELECT
           SUM(COALESCE(qty, 0))::numeric(12,3) AS qty,
           SUM(COALESCE(free_qty, 0))::numeric(12,3) AS free_qty
         FROM inventory_txns it
         WHERE it.account_id = pb.account_id AND it.batch_id = pb.id
       ) st ON TRUE
       WHERE pb.account_id = $1
         AND pb.deleted_at IS NULL
         AND lower(pb.barcode) = lower($2)
       ORDER BY pb.expiry_date ASC NULLS LAST
       LIMIT 1`,
      [permCtx.accountId, barcode]
    );
    const item = rs.rows?.[0] || null;
    if (!item) return fail(404, "NOT_FOUND", "No batch found for this barcode.");
    return ok({ item });
  } catch {
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: "Please try again." });
  }
}

module.exports = { handler };
