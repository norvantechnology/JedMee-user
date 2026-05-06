const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");

/**
 * GET /dashboard/alerts
 *
 * Returns three alert categories:
 *  1. nonMoving  — batches with stock but no sale in N days
 *  2. expiring   — batches expiring within 90 days (or already expired)
 *  3. lowStock   — products whose total stock <= reorder_level
 */
async function handler(event) {
  const auth = await requirePermission(event, "PRODUCT_BATCHES", "VIEW");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const settingsRes = await query(
    `SELECT non_moving_threshold_days, show_non_moving_ticker
       FROM account_settings WHERE account_id = $1 LIMIT 1`,
    [ctx.accountId]
  );
  const s = settingsRes.rows?.[0] || {};
  const nonMovingDays = Number(s.non_moving_threshold_days || 90);
  const showNonMoving = s.show_non_moving_ticker === undefined ? true : Boolean(s.show_non_moving_ticker);

  try {
    const [nonMovingR, expiringR, lowStockR] = await Promise.all([
      // ── Non-moving ──────────────────────────────────────────────────────────
      showNonMoving
        ? query(
            `
            WITH last_sale AS (
              SELECT batch_id, MAX(created_at) AS last_sale_at
              FROM inventory_txns
              WHERE account_id = $1 AND txn_type = 'SALE'
              GROUP BY batch_id
            ),
            candidate_batches AS (
              SELECT
                pb.id AS batch_id, pb.product_id, pb.batch_no,
                pb.current_stock, pb.loose_stock,
                p.name AS product_name, p.code AS product_code,
                ls.last_sale_at::date AS last_sale_date
              FROM product_batches pb
              JOIN products p ON p.id = pb.product_id AND p.account_id = pb.account_id
              LEFT JOIN last_sale ls ON ls.batch_id = pb.id
              WHERE pb.account_id = $1 AND pb.deleted_at IS NULL AND pb.current_stock > 0
                AND (ls.last_sale_at IS NULL OR ls.last_sale_at < now() - ($2::int || ' days')::interval)
            ),
            ranked AS (
              SELECT cb.*, ROW_NUMBER() OVER (PARTITION BY cb.product_id ORDER BY cb.current_stock DESC, cb.batch_id) AS rn
              FROM candidate_batches cb
            ),
            stock_per_product AS (
              SELECT product_id, SUM(current_stock)::numeric(14,3) AS total_current_stock, SUM(loose_stock)::numeric(14,3) AS total_loose_stock
              FROM candidate_batches GROUP BY product_id
            )
            SELECT r.batch_id, r.product_id, r.batch_no, sp.total_current_stock AS current_stock,
                   sp.total_loose_stock AS loose_stock, r.product_name, r.product_code, r.last_sale_date
            FROM ranked r
            INNER JOIN stock_per_product sp ON sp.product_id = r.product_id
            WHERE r.rn = 1
            ORDER BY sp.total_current_stock DESC, r.product_name ASC LIMIT 50
            `,
            [ctx.accountId, nonMovingDays]
          )
        : Promise.resolve({ rows: [] }),

      // ── Expiring batches (within 90 days or already expired) ────────────────
      query(
        `SELECT pb.id AS batch_id, pb.batch_no, pb.expiry_date, pb.current_stock,
                p.name AS product_name, p.code AS product_code,
                CASE WHEN pb.expiry_date < CURRENT_DATE THEN 'EXPIRED'
                     WHEN pb.expiry_date < CURRENT_DATE + INTERVAL '30 days' THEN 'CRITICAL'
                     ELSE 'WARNING' END AS severity
         FROM product_batches pb
         JOIN products p ON p.id = pb.product_id AND p.account_id = pb.account_id
         WHERE pb.account_id = $1
           AND pb.deleted_at IS NULL
           AND pb.current_stock > 0
           AND pb.expiry_date IS NOT NULL
           AND pb.expiry_date <= CURRENT_DATE + INTERVAL '90 days'
         ORDER BY pb.expiry_date ASC LIMIT 50`,
        [ctx.accountId]
      ),

      // ── Low stock (total stock <= reorder_level) ─────────────────────────────
      query(
        `SELECT p.id AS product_id, p.name AS product_name, p.code AS product_code,
                p.reorder_level,
                COALESCE(SUM(pb.current_stock), 0) AS total_stock
         FROM products p
         LEFT JOIN product_batches pb ON pb.product_id = p.id AND pb.account_id = p.account_id AND pb.deleted_at IS NULL
         WHERE p.account_id = $1
           AND p.deleted_at IS NULL
           AND p.reorder_level IS NOT NULL
           AND p.reorder_level > 0
         GROUP BY p.id, p.name, p.code, p.reorder_level
         HAVING COALESCE(SUM(pb.current_stock), 0) <= p.reorder_level
         ORDER BY total_stock ASC LIMIT 50`,
        [ctx.accountId]
      ),
    ]);

    return ok({
      nonMoving:    nonMovingR.rows || [],
      expiring:     expiringR.rows  || [],
      lowStock:     lowStockR.rows  || [],
      thresholdDays: { nonMoving: nonMovingDays, expiry: 90 },
      visibility:   { nonMoving: showNonMoving },
    });
  } catch (e) {
    void actorId;
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: String(e.message || "Please try again.") });
  }
}

module.exports = { handler };
