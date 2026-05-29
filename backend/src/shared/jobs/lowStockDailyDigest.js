const { query } = require("../db");
const { sendPushNotification } = require("../fcm");
const { filterUserIdsForPush } = require("../notifications/notificationDispatcher");
const { getNotificationMeta } = require("../notifications/notificationCatalog");

/**
 * Count products (SKU-level) in low-stock state for an account.
 */
async function countLowStockProducts(accountId) {
  const r = await query(
    `
    WITH inv AS (
      SELECT
        pb.product_id,
        SUM(COALESCE(st.qty, 0) + COALESCE(st.free_qty, 0))::numeric(12, 3) AS total_qty
      FROM product_batches pb
      LEFT JOIN (
        SELECT batch_id, SUM(COALESCE(qty, 0))::numeric(12, 3) AS qty, SUM(COALESCE(free_qty, 0))::numeric(12, 3) AS free_qty
        FROM inventory_txns
        WHERE account_id = $1
        GROUP BY batch_id
      ) st ON st.batch_id = pb.id
      WHERE pb.account_id = $1 AND pb.deleted_at IS NULL
      GROUP BY pb.product_id
    )
    SELECT COUNT(*)::int AS c
    FROM products p
    LEFT JOIN inv ON inv.product_id = p.id
    WHERE p.account_id = $1
      AND p.deleted_at IS NULL
      AND COALESCE(p.low_stock_alert_enabled, false)
      AND COALESCE(inv.total_qty, 0) <= COALESCE(p.low_stock_threshold, 0)
    `,
    [accountId]
  );
  return Number(r.rows?.[0]?.c || 0);
}

/**
 * Count batches in low-stock state for an account.
 */
async function countLowStockBatches(accountId) {
  const r = await query(
    `
    SELECT COUNT(*)::int AS c
    FROM product_batches pb
    LEFT JOIN (
      SELECT batch_id, SUM(COALESCE(qty, 0))::numeric(12, 3) AS qty, SUM(COALESCE(free_qty, 0))::numeric(12, 3) AS free_qty
      FROM inventory_txns
      WHERE account_id = $1
      GROUP BY batch_id
    ) st ON st.batch_id = pb.id
    WHERE pb.account_id = $1
      AND pb.deleted_at IS NULL
      AND COALESCE(pb.low_stock_alert_enabled, false)
      AND (COALESCE(st.qty, 0) + COALESCE(st.free_qty, 0)) <= COALESCE(pb.low_stock_threshold, 0)
    `,
    [accountId]
  );
  return Number(r.rows?.[0]?.c || 0);
}

/**
 * Users who should receive inventory-style alerts (owner + sub-users with PRODUCT_BATCHES VIEW).
 */
function notifyUsersSubquery() {
  return `
    SELECT u.id
    FROM app_users u
    WHERE u.account_id = $1
      AND u.status = 'APPROVED'
      AND u.is_blocked = false
      AND (
        u.id = u.account_id
        OR EXISTS (
          SELECT 1
          FROM user_role_members urm
          JOIN user_role_permissions urp ON urp.role_id = urm.role_id
          WHERE urm.user_id = u.id
            AND urp.resource = 'PRODUCT_BATCHES'
            AND urp.can_view = true
        )
      )
  `;
}

/**
 * Insert one digest notification per eligible user when there is at least one low-stock SKU or batch.
 * Idempotent per user per calendar day (UTC) via dedupe_key.
 */
async function insertLowStockDigestForAccount(accountId, ymd) {
  const lowProducts = await countLowStockProducts(accountId);
  const lowBatches = await countLowStockBatches(accountId);
  if (lowProducts === 0 && lowBatches === 0) return 0;

  const title = "Daily stock alert";
  const parts = [];
  if (lowProducts > 0) parts.push(`${lowProducts} product${lowProducts === 1 ? "" : "s"} running low`);
  if (lowBatches > 0) parts.push(`${lowBatches} batch${lowBatches === 1 ? "" : "es"} running low`);
  const body = `You have ${parts.join(" and ")}. Please check your inventory.`;

  const payloadJson = JSON.stringify({
    lowProductCount: lowProducts,
    lowBatchCount: lowBatches,
    runDate: ymd,
  });
  const dailyMeta = getNotificationMeta("LOW_STOCK_DAILY");
  const { hasPriorityColumns } = require("../notifications/notificationSchema");
  const extended = await hasPriorityColumns();

  const ins = extended
    ? await query(
        `
        INSERT INTO user_notifications (
          account_id, user_id, type, title, body, payload,
          action_label, action_path, dedupe_key, priority, category
        )
        SELECT
          $1, nu.id, 'LOW_STOCK_DAILY', $2, $3, $4::jsonb,
          'View products', '/quality-master',
          'LOW_STOCK_DAILY:' || $5 || ':' || nu.id::text, $6, $7
        FROM (${notifyUsersSubquery()}) nu
        WHERE NOT EXISTS (
          SELECT 1 FROM user_notifications un
          WHERE un.user_id = nu.id
            AND un.dedupe_key = ('LOW_STOCK_DAILY:' || $5 || ':' || nu.id::text)
        )
        RETURNING id
        `,
        [accountId, title, body, payloadJson, ymd, dailyMeta.priority, dailyMeta.category]
      )
    : await query(
        `
        INSERT INTO user_notifications (
          account_id, user_id, type, title, body, payload,
          action_label, action_path, dedupe_key
        )
        SELECT
          $1, nu.id, 'LOW_STOCK_DAILY', $2, $3, $4::jsonb,
          'View products', '/quality-master',
          'LOW_STOCK_DAILY:' || $5 || ':' || nu.id::text
        FROM (${notifyUsersSubquery()}) nu
        WHERE NOT EXISTS (
          SELECT 1 FROM user_notifications un
          WHERE un.user_id = nu.id
            AND un.dedupe_key = ('LOW_STOCK_DAILY:' || $5 || ':' || nu.id::text)
        )
        RETURNING id
        `,
        [accountId, title, body, payloadJson, ymd]
      );

  const inserted = (ins.rows || []).length;

  // Send push notification to eligible users if any DB rows were inserted.
  if (inserted > 0) {
    try {
      const r = await query(
        `SELECT id FROM (${notifyUsersSubquery()}) nu`,
        [accountId]
      );
      const userIds = (r.rows || []).map((row) => String(row.id));
      const pushUserIds = await filterUserIdsForPush(userIds, "LOW_STOCK_DAILY");
      if (pushUserIds.length) {
        await sendPushNotification({
          userIds: pushUserIds,
          title,
          body,
          type: "LOW_STOCK_DAILY",
          actionPath: "/quality-master",
          data: {
            priority: dailyMeta.priority,
            category: dailyMeta.category,
            lowProductCount: String(lowProducts),
            lowBatchCount: String(lowBatches),
          },
        });
      }
    } catch (pushErr) {
      console.error("[lowStockDailyDigest] Push notification failed:", pushErr);
    }
  }

  return inserted;
}

/**
 * Run digest for every account that has at least one approved user.
 */
async function runDailyLowStockDigest() {
  const ymd = new Date().toISOString().slice(0, 10);
  const acc = await query(
    `
    SELECT DISTINCT account_id
    FROM app_users
    WHERE status = 'APPROVED' AND is_blocked = false
    `,
    []
  );
  let totalInserted = 0;
  for (const row of acc.rows || []) {
    const aid = row.account_id;
    if (!aid) continue;
    // eslint-disable-next-line no-await-in-loop
    const n = await insertLowStockDigestForAccount(aid, ymd);
    totalInserted += n;
  }
  return { runDate: ymd, accountsScanned: (acc.rows || []).length, notificationsInserted: totalInserted };
}

module.exports = {
  countLowStockProducts,
  countLowStockBatches,
  insertLowStockDigestForAccount,
  runDailyLowStockDigest,
  notifyUsersSubquery
};
