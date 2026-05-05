const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");

/**
 * GET /reports/non-moving?days=<int>
 *
 * Non-moving stock report. A batch is non-moving if it has stock > 0 and
 * either has never been sold OR its last SALE inventory_txn is older than
 * the threshold (days). Threshold defaults to account_settings
 * .non_moving_threshold_days, or 90 if missing.
 */
async function handler(event) {
  const auth = await requirePermission(event, "PRODUCT_BATCHES", "VIEW");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const qs = event?.queryStringParameters || {};
  let days = parseInt(qs.days, 10);
  if (!Number.isFinite(days) || days <= 0) {
    const s = await query(
      `SELECT non_moving_threshold_days FROM account_settings WHERE account_id = $1 LIMIT 1`,
      [ctx.accountId]
    );
    days = Number(s.rows?.[0]?.non_moving_threshold_days || 90);
  }
  const limit = Math.min(Math.max(parseInt(qs.limit, 10) || 200, 1), 1000);

  try {
    const res = await query(
      `
      WITH last_sale AS (
        -- Most recent SALE transaction per batch
        SELECT batch_id, MAX(created_at) AS last_sale_at
        FROM inventory_txns
        WHERE account_id = $1 AND txn_type = 'SALE'
        GROUP BY batch_id
      ),
      last_purchase AS (
        -- Most recent stock-IN transaction per batch (purchase, opening, adjustment-in)
        SELECT batch_id, MAX(created_at) AS last_purchase_at
        FROM inventory_txns
        WHERE account_id = $1 AND txn_type IN ('PURCHASE', 'OPENING', 'ADJUSTMENT')
        GROUP BY batch_id
      )
      SELECT
        pb.id          AS batch_id,
        pb.product_id,
        pb.batch_no,
        pb.expiry_date,
        pb.current_stock,
        pb.loose_stock,
        pb.mrp,
        pb.sales_rate,
        ls.last_sale_at::date AS last_sale_date,
        CASE
          WHEN ls.last_sale_at IS NULL THEN NULL
          ELSE GREATEST(0, EXTRACT(DAY FROM (now() - ls.last_sale_at))::int)
        END AS days_since_last_sale,
        -- days_idle = days since the LATEST of: last sale, last purchase, or batch creation
        GREATEST(0, EXTRACT(DAY FROM (
          now() - GREATEST(
            COALESCE(ls.last_sale_at,    pb.created_at),
            COALESCE(lp.last_purchase_at, pb.created_at)
          )
        ))::int) AS days_idle,
        p.code  AS product_code,
        p.name  AS product_name,
        p.drug_name,
        mc.name AS mfg_name,
        v.name  AS supplier_name
      FROM product_batches pb
      JOIN products p        ON p.id = pb.product_id AND p.account_id = pb.account_id
      LEFT JOIN mfg_companies mc ON mc.id = p.mfg_company_id AND mc.account_id = p.account_id
      LEFT JOIN vendors v        ON v.id = pb.vendor_id    AND v.account_id = pb.account_id AND v.deleted_at IS NULL
      LEFT JOIN last_sale ls     ON ls.batch_id = pb.id
      LEFT JOIN last_purchase lp ON lp.batch_id = pb.id
      WHERE pb.account_id = $1
        AND pb.deleted_at IS NULL
        AND pb.current_stock > 0
        -- Only include batches where the most recent activity (sale OR purchase) is
        -- older than the threshold. This prevents newly-purchased items from appearing.
        AND GREATEST(
          COALESCE(ls.last_sale_at,    pb.created_at),
          COALESCE(lp.last_purchase_at, pb.created_at)
        ) < now() - ($2::int || ' days')::interval
      ORDER BY days_idle DESC, pb.current_stock DESC
      LIMIT ${limit}
      `,
      [ctx.accountId, days]
    );
    return ok({ items: res.rows || [], thresholdDays: days });
  } catch (e) {
    void actorId;
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: String(e.message || "Please try again.") });
  }
}

module.exports = { handler };
