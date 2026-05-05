const { query } = require("./db");
const { notifyUsersSubquery } = require("./jobs/lowStockDailyDigest");

function uniqIds(ids) {
  const out = [];
  const seen = new Set();
  for (const raw of ids || []) {
    const id = String(raw || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function fmtQty(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0";
  return String(Number(x.toFixed(3)));
}

/**
 * @param {string} accountId
 * @param {{ type: string, title: string, body: string, payload?: object, actionLabel?: string, actionPath?: string }} n
 */
async function insertInventoryAlertNotifications(accountId, n) {
  const payloadJson = JSON.stringify(n.payload || {});
  const actionLabel = n.actionLabel != null ? String(n.actionLabel) : "View products";
  const actionPath = n.actionPath != null ? String(n.actionPath) : "/quality-master";
  await query(
    `
    INSERT INTO user_notifications (
      account_id, user_id, type, title, body, payload, action_label, action_path, dedupe_key, created_by_user_id
    )
    SELECT $1, nu.id, $2, $3, $4, $5::jsonb, $6, $7, NULL, NULL
    FROM (${notifyUsersSubquery()}) nu
    `,
    [accountId, n.type, n.title, n.body, payloadJson, actionLabel, actionPath]
  );
}

async function ensureNotifyStateRow(accountId, scope, entityId) {
  await query(
    `
    INSERT INTO low_stock_notify_state (account_id, scope, entity_id, armed)
    VALUES ($1, $2, $3, true)
    ON CONFLICT (account_id, scope, entity_id) DO NOTHING
    `,
    [accountId, scope, entityId]
  );
}

/**
 * If not low: re-arm for the next dip.
 * If low and armed: disarm and return true (caller should notify).
 * If low and not armed: return false.
 */
async function consumeArmedLowTransition(accountId, scope, entityId, isLow) {
  await ensureNotifyStateRow(accountId, scope, entityId);
  if (!isLow) {
    await query(
      `
      UPDATE low_stock_notify_state
      SET armed = true, updated_at = now()
      WHERE account_id = $1 AND scope = $2 AND entity_id = $3
      `,
      [accountId, scope, entityId]
    );
    return false;
  }
  const r = await query(
    `
    UPDATE low_stock_notify_state
    SET armed = false, updated_at = now()
    WHERE account_id = $1 AND scope = $2 AND entity_id = $3 AND armed = true
    RETURNING 1
    `,
    [accountId, scope, entityId]
  );
  return Boolean(r.rows?.length);
}

function batchIsLow(row) {
  const enabled = Boolean(row.low_stock_alert_enabled);
  const total = Number(row.total || 0);
  const thr = Number(row.low_stock_threshold || 0);
  return enabled && total <= thr;
}

function productIsLow(row) {
  const enabled = Boolean(row.low_stock_alert_enabled);
  const total = Number(row.total || 0);
  const thr = Number(row.low_stock_threshold || 0);
  return enabled && total <= thr;
}

async function loadBatchContexts(accountId, batchIds) {
  if (!batchIds.length) return [];
  const r = await query(
    `
    SELECT
      pb.id,
      pb.product_id,
      pb.batch_no,
      pb.low_stock_alert_enabled,
      pb.low_stock_threshold,
      (COALESCE(st.qty, 0) + COALESCE(st.free_qty, 0))::numeric(12, 3) AS total,
      p.name AS product_name,
      p.code AS product_code
    FROM product_batches pb
    JOIN products p ON p.id = pb.product_id AND p.account_id = pb.account_id AND p.deleted_at IS NULL
    LEFT JOIN (
      SELECT
        batch_id,
        SUM(COALESCE(qty, 0))::numeric(12, 3) AS qty,
        SUM(COALESCE(free_qty, 0))::numeric(12, 3) AS free_qty
      FROM inventory_txns
      WHERE account_id = $1 AND batch_id = ANY($2::uuid[])
      GROUP BY batch_id
    ) st ON st.batch_id = pb.id
    WHERE pb.account_id = $1 AND pb.id = ANY($2::uuid[]) AND pb.deleted_at IS NULL
    `,
    [accountId, batchIds]
  );
  return r.rows || [];
}

async function loadProductContexts(accountId, productIds) {
  if (!productIds.length) return [];
  const r = await query(
    `
    SELECT
      p.id,
      p.name AS product_name,
      p.code AS product_code,
      p.low_stock_alert_enabled,
      p.low_stock_threshold,
      (
        SELECT COALESCE(SUM(COALESCE(st.qty, 0) + COALESCE(st.free_qty, 0)), 0)::numeric(12, 3)
        FROM product_batches pb
        LEFT JOIN (
          SELECT
            batch_id,
            SUM(COALESCE(qty, 0))::numeric(12, 3) AS qty,
            SUM(COALESCE(free_qty, 0))::numeric(12, 3) AS free_qty
          FROM inventory_txns
          WHERE account_id = p.account_id
          GROUP BY batch_id
        ) st ON st.batch_id = pb.id
        WHERE pb.account_id = p.account_id
          AND pb.product_id = p.id
          AND pb.deleted_at IS NULL
      ) AS total
    FROM products p
    WHERE p.account_id = $1 AND p.id = ANY($2::uuid[]) AND p.deleted_at IS NULL
    `,
    [accountId, productIds]
  );
  return r.rows || [];
}

async function evaluateBatches(accountId, batchRows) {
  for (const row of batchRows) {
    const bid = String(row.id);
    const low = batchIsLow(row);
    // eslint-disable-next-line no-await-in-loop
    const fire = await consumeArmedLowTransition(accountId, "BATCH", bid, low);
    if (!fire) continue;

    const title = "Low stock: batch";
    const body = `Batch "${row.batch_no}" (${row.product_name || row.product_code || "product"}) is at or below threshold (total ${fmtQty(row.total)} ≤ ${fmtQty(row.low_stock_threshold)}).`;
    // eslint-disable-next-line no-await-in-loop
    await insertInventoryAlertNotifications(accountId, {
      type: "LOW_STOCK_BATCH",
      title,
      body,
      payload: {
        batchId: bid,
        productId: String(row.product_id),
        batchNo: row.batch_no,
        total: Number(row.total),
        threshold: Number(row.low_stock_threshold || 0)
      }
    });
  }
}

async function evaluateProducts(accountId, productRows) {
  for (const row of productRows) {
    const pid = String(row.id);
    const low = productIsLow(row);
    // eslint-disable-next-line no-await-in-loop
    const fire = await consumeArmedLowTransition(accountId, "PRODUCT", pid, low);
    if (!fire) continue;

    const title = "Low stock: product";
    const body = `Product "${row.product_name || row.product_code}" total stock is at or below threshold (total ${fmtQty(row.total)} ≤ ${fmtQty(row.low_stock_threshold)}).`;
    // eslint-disable-next-line no-await-in-loop
    await insertInventoryAlertNotifications(accountId, {
      type: "LOW_STOCK_PRODUCT",
      title,
      body,
      payload: {
        productId: pid,
        productCode: row.product_code,
        total: Number(row.total),
        threshold: Number(row.low_stock_threshold || 0)
      }
    });
  }
}

/**
 * After inventory changes, re-evaluate low-stock alerts for the given batches (and their products).
 * Fires at most one instant notification per batch/product per "dip" (see low_stock_notify_state).
 */
async function refreshLowStockNotifications(accountId, batchIds) {
  const ids = uniqIds(batchIds);
  if (!ids.length) return;
  try {
    const batchRows = await loadBatchContexts(accountId, ids);
    await evaluateBatches(accountId, batchRows);

    const productIds = uniqIds(batchRows.map((r) => r.product_id));
    if (!productIds.length) return;
    const productRows = await loadProductContexts(accountId, productIds);
    await evaluateProducts(accountId, productRows);
  } catch (e) {
    console.error("[lowStockInstantNotify:refreshLowStockNotifications]", e);
  }
}

/**
 * When only product-level settings or aggregate stock context changes (no batch list).
 */
async function refreshLowStockForProducts(accountId, productIds) {
  const ids = uniqIds(productIds);
  if (!ids.length) return;
  try {
    const productRows = await loadProductContexts(accountId, ids);
    await evaluateProducts(accountId, productRows);
  } catch (e) {
    console.error("[lowStockInstantNotify:refreshLowStockForProducts]", e);
  }
}

module.exports = {
  refreshLowStockNotifications,
  refreshLowStockForProducts
};
