const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");

function clean(v) {
  return String(v ?? "").trim();
}

async function handler(event) {
  const auth = await requirePermission(event, "PRODUCT_BATCHES", "VIEW");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const qs = event?.queryStringParameters || {};
  const page = Math.max(1, Number(qs.page) || 1);
  const limit = Math.min(500, Math.max(1, Number(qs.limit) || 50));
  const offset = (page - 1) * limit;
  const search = clean(qs.search || qs.q);
  const mfgCompanyId = clean(qs.mfg_company_id || qs.mfgCompanyId);
  const divisionId = clean(qs.division_id || qs.divisionId);
  // Optional: only SKUs that already have ≥1 live batch (e.g. some purchase flows).
  const requireActiveBatchRaw = clean(qs.require_active_batch || qs.requireActiveBatch || "");
  const requireActiveBatch =
    requireActiveBatchRaw === "1" ||
    requireActiveBatchRaw.toLowerCase() === "true" ||
    requireActiveBatchRaw.toLowerCase() === "yes";
  const sortBy = clean(qs.sort_by || qs.sortBy || "created_at");
  const sortOrder = clean(qs.sort_order || qs.sortOrder || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";
  const allowedSort = new Set(["name", "code", "created_at", "updated_at", "total_quantity", "active_batch_count", "low_batch_count"]);
  const orderBy = allowedSort.has(sortBy) ? sortBy : "created_at";

  const wh = ["p.account_id = $1", "p.deleted_at IS NULL"];
  const ps = [ctx.accountId];
  if (search) {
    ps.push(`%${search}%`);
    wh.push(`(p.code ILIKE $${ps.length} OR p.name ILIKE $${ps.length} OR COALESCE(p.drug_name,'') ILIKE $${ps.length})`);
  }
  if (mfgCompanyId) {
    ps.push(mfgCompanyId);
    wh.push(`p.mfg_company_id = $${ps.length}`);
  }
  if (divisionId) {
    ps.push(divisionId);
    wh.push(`p.division_id = $${ps.length}`);
  }
  if (requireActiveBatch) {
    wh.push(`EXISTS (
      SELECT 1 FROM product_batches pb
      WHERE pb.account_id = p.account_id
        AND pb.product_id = p.id
        AND pb.deleted_at IS NULL
    )`);
  }
  const whereSql = `WHERE ${wh.join(" AND ")}`;

  try {
    const cnt = await query(`SELECT COUNT(*)::int AS c FROM products p ${whereSql}`, ps);
    const total = Number(cnt.rows?.[0]?.c || 0);
    const rows = await query(
      `
      WITH batch_stock AS (
        SELECT
          pb.account_id,
          pb.product_id,
          COUNT(*)::int AS active_batch_count,
          COALESCE(SUM(COALESCE(st.qty, 0) + COALESCE(st.free_qty, 0)), 0)::numeric(12,3) AS total_quantity,
          COALESCE(SUM(COALESCE(pb.loose_stock, 0)), 0)::numeric(12,3) AS total_loose_quantity,
          COUNT(*) FILTER (
            WHERE COALESCE(pb.low_stock_alert_enabled, false)
              AND (COALESCE(st.qty, 0) + COALESCE(st.free_qty, 0)) <= COALESCE(pb.low_stock_threshold, 0)
          )::int AS low_batch_count
        FROM product_batches pb
        LEFT JOIN (
          SELECT batch_id, SUM(COALESCE(qty,0))::numeric(12,3) AS qty, SUM(COALESCE(free_qty,0))::numeric(12,3) AS free_qty
          FROM inventory_txns
          WHERE account_id = $1
          GROUP BY batch_id
        ) st ON st.batch_id = pb.id
        WHERE pb.account_id = $1
          AND pb.deleted_at IS NULL
        GROUP BY pb.account_id, pb.product_id
      )
      SELECT
        p.*,
        m.code AS mfg_company_code,
        m.name AS mfg_company_name,
        m.short_name AS mfg_short_name,
        COALESCE(m.purchase_order_lock, false) AS mfg_purchase_order_lock,
        COALESCE(m.sale_lock, false) AS mfg_sale_lock,
        COALESCE(m.prevent_discount, false) AS mfg_prevent_discount,
        COALESCE(m.prevent_free_qty, false) AS mfg_prevent_free_qty,
        COALESCE(m.prevent_net_rate, false) AS mfg_prevent_net_rate,
        d.name AS division_name,
        d.code AS division_code,
        COALESCE(d.is_active, true) AS division_is_active,
        COALESCE(bs.active_batch_count, 0)::int AS active_batch_count,
        COALESCE(bs.total_quantity, 0)::numeric(12,3) AS total_quantity,
        COALESCE(bs.total_loose_quantity, 0)::numeric(12,3) AS total_loose_quantity,
        COALESCE(bs.low_batch_count, 0)::int AS low_batch_count,
        (
          COALESCE(p.low_stock_alert_enabled, false)
          AND COALESCE(bs.total_quantity, 0) <= COALESCE(p.low_stock_threshold, 0)
        ) AS product_low_stock,
        sup.sp_id          AS supplier_product_id,
        sup.sp_vendor_id   AS supplier_id,
        sup.sp_vendor_name AS supplier_name,
        sup.sp_vendor_short_name AS supplier_short_name,
        sup.sp_is_preferred      AS supplier_is_preferred
      FROM products p
      LEFT JOIN mfg_companies m
        ON m.id = p.mfg_company_id
       AND m.account_id = p.account_id
       AND m.deleted_at IS NULL
      LEFT JOIN divisions d
        ON d.id = p.division_id
       AND d.account_id = p.account_id
       AND d.deleted_at IS NULL
      LEFT JOIN batch_stock bs
        ON bs.account_id = p.account_id
       AND bs.product_id = p.id
      LEFT JOIN LATERAL (
        SELECT
          sp.id            AS sp_id,
          sp.vendor_id     AS sp_vendor_id,
          sp.is_preferred  AS sp_is_preferred,
          v.name           AS sp_vendor_name,
          v.short_name     AS sp_vendor_short_name
        FROM supplier_products sp
        JOIN vendors v
          ON v.id = sp.vendor_id
         AND v.account_id = sp.account_id
         AND v.deleted_at IS NULL
        WHERE sp.account_id = p.account_id
          AND sp.product_id = p.id
        ORDER BY sp.is_preferred DESC, sp.last_supplied_on DESC NULLS LAST
        LIMIT 1
      ) sup ON true
      ${whereSql}
      ORDER BY ${orderBy} ${sortOrder}
      LIMIT $${ps.length + 1} OFFSET $${ps.length + 2}
      `,
      [...ps, limit, offset]
    );
    const totalPages = Math.max(1, Math.ceil(total / limit));
    return ok({
      items: rows.rows || [],
      pagination: {
        page,
        limit,
        total,
        total_pages: totalPages,
        has_next: page < totalPages,
        has_prev: page > 1
      }
    });
  } catch {
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: "Please try again." });
  }
}

module.exports = { handler };
