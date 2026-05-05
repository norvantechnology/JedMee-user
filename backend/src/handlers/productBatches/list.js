const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requireApprovedUser } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { getSortFromEvent, buildOrderBy } = require("../../shared/sort");
const { computeExpiryStatus } = require("../../shared/productBatchCalc");

function clean(v) {
  return String(v ?? "").trim();
}

function getQs(event, key) {
  const qs = event?.queryStringParameters || {};
  return clean(qs?.[key]);
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
  const canUseSales = isOwner || Boolean(perms?.SALES_INVOICES?.VIEW || perms?.SALES_INVOICES?.ADD || perms?.SALES_INVOICES?.UPDATE);
  const canUsePurchase = isOwner || Boolean(perms?.PURCHASE_INVOICES?.VIEW || perms?.PURCHASE_INVOICES?.ADD || perms?.PURCHASE_INVOICES?.UPDATE);
  if (!canViewBatches && !canUseSales && !canUsePurchase) {
    return fail(403, "FORBIDDEN", "You do not have permission to view batches");
  }
  const ctx = permCtx;

  const productId = getQs(event, "product_id") || getQs(event, "productId");
  const sort = getSortFromEvent(event);
  const orderBy =
    clean(productId) && !clean(sort.sortBy)
      ? ` ORDER BY pb.expiry_date ASC NULLS LAST, pb.batch_no ASC `
      : buildOrderBy({
          sortBy: sort.sortBy,
          sortDir: sort.sortDir,
          allowed: {
            created_at: "pb.created_at",
            product_name: "pb.product_name",
            batch_no: "pb.batch_no",
            expiry_date: "pb.expiry_date",
            mrp: "pb.mrp",
            purchase_rate: "pb.purchase_rate",
            sales_rate: "pb.sales_rate",
            updated_at: "pb.updated_at"
          },
          fallback: "pb.created_at DESC"
        });

  const expiry = getQs(event, "expiry").toUpperCase(); // EXPIRED | NEAR | VALID (legacy 30d) | NEAR_EXPIRY (90d) | ACTIVE
  const stockable = getQs(event, "stockable").toUpperCase(); // STOCKABLE | NON_STOCKABLE
  const hold = getQs(event, "hold").toUpperCase(); // HOLD | NOT_HOLD
  const q = getQs(event, "q");
  const divisionId = getQs(event, "division_id") || getQs(event, "divisionId");
  const mfgCompanyId = getQs(event, "mfg_company_id") || getQs(event, "mfgCompanyId");
  const respectStockReportLock = ["1", "true", "yes"].includes(getQs(event, "respect_mfg_stock_report_lock").toLowerCase());
  const showLockedMfg = ["1", "true", "yes"].includes(getQs(event, "show_locked_mfg").toLowerCase());

  const where = [`account_id = $1`, `deleted_at IS NULL`];
  const args = [ctx.accountId];
  let i = 2;

  if (expiry === "EXPIRED") {
    where.push(`expiry_date IS NOT NULL AND expiry_date < CURRENT_DATE`);
  } else if (expiry === "NEAR") {
    // legacy 30 day window (kept for back-compat)
    where.push(`expiry_date IS NOT NULL AND expiry_date >= CURRENT_DATE AND expiry_date <= (CURRENT_DATE + INTERVAL '30 days')`);
  } else if (expiry === "NEAR_EXPIRY") {
    where.push(`expiry_date IS NOT NULL AND expiry_date >= CURRENT_DATE AND expiry_date <= (CURRENT_DATE + INTERVAL '90 days')`);
  } else if (expiry === "VALID") {
    where.push(`expiry_date IS NOT NULL AND expiry_date > (CURRENT_DATE + INTERVAL '30 days')`);
  } else if (expiry === "ACTIVE") {
    where.push(`expiry_date IS NOT NULL AND expiry_date > (CURRENT_DATE + INTERVAL '90 days')`);
  }

  if (stockable === "STOCKABLE") {
    where.push(`COALESCE(p.stockable, pb.stockable) IS TRUE`);
  } else if (stockable === "NON_STOCKABLE") {
    where.push(`COALESCE(p.stockable, pb.stockable) IS FALSE`);
  }

  if (hold === "HOLD") {
    where.push(`pb.is_hold IS TRUE`);
  } else if (hold === "NOT_HOLD") {
    where.push(`pb.is_hold IS FALSE`);
  }

  if (q) {
    where.push(`(pb.product_name ILIKE $${i} OR pb.batch_no ILIKE $${i} OR pb.product_code ILIKE $${i} OR pb.barcode ILIKE $${i})`);
    args.push(`%${q}%`);
    i += 1;
  }
  if (productId) {
    where.push(`pb.product_id = $${i}`);
    args.push(productId);
    i += 1;
  }
  if (divisionId) {
    where.push(`COALESCE(p.division_id, pb.division_id) = $${i}`);
    args.push(divisionId);
    i += 1;
  }
  if (mfgCompanyId) {
    where.push(`p.mfg_company_id = $${i}`);
    args.push(mfgCompanyId);
    i += 1;
  }
  if (respectStockReportLock && !showLockedMfg) {
    where.push(`(mc.id IS NULL OR mc.stock_report_lock IS DISTINCT FROM TRUE)`);
  }

  const res = await query(
    `
    SELECT
      pb.id,
      pb.product_id,
      pb.vendor_id,
      pb.division_id,
      COALESCE(pdiv.name, div.name) AS division_name,
      COALESCE(pdiv.code, div.code) AS division_code,
      COALESCE(p.division_id, pb.division_id) AS product_division_id,
      p.mfg_company_id,
      mc.name AS mfg_company_name,
      mc.short_name AS mfg_short_name,
      mc.stock_report_lock AS mfg_stock_report_lock,
      pb.product_code,
      pb.product_name,
      pb.drug_name,
      pb.batch_no,
      pb.barcode,
      pb.expiry_date,
      pb.mfg_date,
      pb.mrp,
      pb.purchase_rate,
      pb.sales_rate,
      pb.retail_rate,
      pb.special_rate_1,
      pb.special_rate_2,
      pb.loose_stock,
      pb.loose_unit_name,
      pb.net_rate,
      pb.landing_cost,
      pb.discount_sales,
      pb.discount_purchase,
      pb.retail_discount_percent,
      pb.net_discount_percent,
      COALESCE(p.sales_scheme, pb.sales_scheme) AS sales_scheme,
      COALESCE(p.scheme_qty_paid, pb.scheme_qty_paid) AS scheme_qty_paid,
      COALESCE(p.scheme_qty_free, pb.scheme_qty_free) AS scheme_qty_free,
      COALESCE(p.sales_gst, pb.sales_gst) AS sales_gst,
      COALESCE(p.purchase_gst, pb.purchase_gst) AS purchase_gst,
      pb.opening_stock,
      pb.open_stock_free_qty,
      COALESCE(p.stockable, pb.stockable) AS stockable,
      COALESCE(p.conversion_unit, pb.conversion_unit::text) AS conversion_unit,
      COALESCE(p.packing, pb.packing) AS packing,
      COALESCE(p.bulk_pack, pb.bulk_pack) AS bulk_pack,
      COALESCE(p.case_pack, pb.case_pack) AS case_pack,
      COALESCE(p.is_discount_enabled, pb.is_discount_enabled) AS is_discount_enabled,
      pb.is_hold,
      COALESCE(p.is_half_scheme, pb.is_half_scheme) AS is_half_scheme,
      pb.is_net,
      pb.is_non_editable_free_qty,
      COALESCE(p.is_control, pb.is_control) AS is_control,
      pb.low_stock_alert_enabled,
      pb.low_stock_threshold,
      pb.created_at,
      pb.updated_at,
      COALESCE(st.qty, 0)::numeric(12, 3) AS stock_billable_qty,
      COALESCE(st.free_qty, 0)::numeric(12, 3) AS stock_free_qty,
      (COALESCE(st.qty, 0) + COALESCE(st.free_qty, 0))::numeric(12, 3) AS total_stock,
      (
        COALESCE(pb.low_stock_alert_enabled, false)
        AND (COALESCE(st.qty, 0) + COALESCE(st.free_qty, 0)) <= COALESCE(pb.low_stock_threshold, 0)
      ) AS batch_low_stock,
      EXISTS (
        SELECT 1
        FROM inventory_txns it
        WHERE it.account_id = pb.account_id
          AND it.batch_id = pb.id
          AND it.txn_type::text <> 'OPENING'
        LIMIT 1
      ) AS opening_stock_locked
    FROM product_batches pb
    INNER JOIN products p ON p.id = pb.product_id AND p.account_id = pb.account_id AND p.deleted_at IS NULL
    LEFT JOIN divisions pdiv ON pdiv.id = p.division_id AND pdiv.account_id = p.account_id AND pdiv.deleted_at IS NULL
    LEFT JOIN divisions div ON div.id = pb.division_id AND div.account_id = pb.account_id AND div.deleted_at IS NULL
    LEFT JOIN mfg_companies mc ON mc.id = p.mfg_company_id AND mc.account_id = p.account_id AND mc.deleted_at IS NULL
    LEFT JOIN (
      SELECT
        batch_id,
        SUM(COALESCE(qty, 0))::numeric(12,3) AS qty,
        SUM(COALESCE(free_qty, 0))::numeric(12,3) AS free_qty
      FROM inventory_txns
      WHERE account_id = $1
      GROUP BY batch_id
    ) st ON st.batch_id = pb.id
    WHERE ${where
      .map((w) =>
        w.startsWith("COALESCE(") || /\bpb\./.test(w) || /\bp\./.test(w) || /\bmc\./.test(w) || /\bdiv\./.test(w)
          ? w
          : w.replace(/\baccount_id\b/g, "pb.account_id").replace(/\bdeleted_at\b/g, "pb.deleted_at")
      )
      .join(" AND ")}
    ${orderBy}
    `,
    args
  );

  const items = (res.rows || []).map((r) => ({ ...r, expiry_status: computeExpiryStatus(r.expiry_date) }));
  return ok({ items });
}

module.exports = { handler };

