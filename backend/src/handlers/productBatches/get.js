const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { computeExpiryStatus } = require("../../shared/productBatchCalc");

function getPathParam(event, name) {
  return (
    event?.pathParameters?.[name] ||
    event?.pathParameters?.[name?.toLowerCase?.()] ||
    event?.pathParameters?.[name?.toUpperCase?.()] ||
    ""
  );
}

function isUuid(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v || "").trim());
}

async function handler(event) {
  const auth = await requirePermission(event, "PRODUCT_BATCHES", "VIEW");
  if (!auth.ok) return auth.resp;

  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const id = String(getPathParam(event, "id") || "").trim();
  if (!id) return fail(400, "VALIDATION_ERROR", "id is required");
  if (!isUuid(id)) return fail(400, "VALIDATION_ERROR", "invalid batch id");

  const res = await query(
    `
    SELECT
      pb.*,
      p.mfg_company_id,
      COALESCE(p.division_id, pb.division_id) AS product_division_id,
      COALESCE(p.sales_gst, pb.sales_gst) AS sales_gst,
      COALESCE(p.purchase_gst, pb.purchase_gst) AS purchase_gst,
      COALESCE(p.sales_scheme, pb.sales_scheme) AS sales_scheme,
      COALESCE(p.scheme_qty_paid, pb.scheme_qty_paid) AS scheme_qty_paid,
      COALESCE(p.scheme_qty_free, pb.scheme_qty_free) AS scheme_qty_free,
      COALESCE(p.packing, pb.packing) AS packing,
      COALESCE(p.bulk_pack, pb.bulk_pack) AS bulk_pack,
      COALESCE(p.case_pack, pb.case_pack) AS case_pack,
      COALESCE(p.conversion_unit, pb.conversion_unit::text) AS conversion_unit,
      COALESCE(p.stockable, pb.stockable) AS stockable,
      COALESCE(p.is_discount_enabled, pb.is_discount_enabled) AS is_discount_enabled,
      COALESCE(p.is_control, pb.is_control) AS is_control,
      COALESCE(p.is_half_scheme, pb.is_half_scheme) AS is_half_scheme,
      pdiv.name AS division_name,
      pdiv.code AS division_code,
      mc.name AS mfg_company_name,
      mc.short_name AS mfg_short_name,
      COALESCE(st.qty, 0)::numeric(12, 3) AS stock_billable_qty,
      COALESCE(st.free_qty, 0)::numeric(12, 3) AS stock_free_qty,
      (COALESCE(st.qty, 0) + COALESCE(st.free_qty, 0))::numeric(12, 3) AS total_stock
    FROM product_batches pb
    LEFT JOIN products p ON p.id = pb.product_id AND p.account_id = pb.account_id
    LEFT JOIN divisions pdiv ON pdiv.id = p.division_id AND pdiv.account_id = p.account_id AND pdiv.deleted_at IS NULL
    LEFT JOIN mfg_companies mc ON mc.id = p.mfg_company_id AND mc.account_id = p.account_id AND mc.deleted_at IS NULL
    LEFT JOIN (
      SELECT
        batch_id,
        SUM(COALESCE(qty, 0))::numeric(12,3) AS qty,
        SUM(COALESCE(free_qty, 0))::numeric(12,3) AS free_qty
      FROM inventory_txns
      WHERE account_id = $2 AND batch_id = $1
      GROUP BY batch_id
    ) st ON st.batch_id = pb.id
    WHERE pb.id = $1 AND pb.account_id = $2 AND pb.deleted_at IS NULL
    LIMIT 1
    `,
    [id, ctx.accountId]
  );
  if (!res.rows[0]) return fail(404, "NOT_FOUND", "Item not found");

  const item = res.rows[0];
  item.expiry_status = computeExpiryStatus(item.expiry_date);
  return ok({ item });
}

module.exports = { handler };

