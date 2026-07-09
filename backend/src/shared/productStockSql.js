/**
 * Stock figures from inventory_txns - same source as products list (total_quantity)
 * and product_batches list (total_stock).
 *
 * Per batch:
 *   billable = SUM(qty), free = SUM(free_qty), total = billable + free
 */

/** Scoped to one account (products list, rich-search, my catalog). */
function batchInventoryStockJoin(accountSqlRef) {
  return `
    LEFT JOIN (
      SELECT
        batch_id,
        SUM(COALESCE(qty, 0))::numeric(12,3) AS qty,
        SUM(COALESCE(free_qty, 0))::numeric(12,3) AS free_qty
      FROM inventory_txns
      WHERE account_id = ${accountSqlRef}
      GROUP BY batch_id
    ) st ON st.batch_id = pb.id
  `;
}

/** All accounts - catalog browse may list multiple wholesalers. */
function batchInventoryStockJoinAllAccounts() {
  return `
    LEFT JOIN (
      SELECT
        account_id,
        batch_id,
        SUM(COALESCE(qty, 0))::numeric(12,3) AS qty,
        SUM(COALESCE(free_qty, 0))::numeric(12,3) AS free_qty
      FROM inventory_txns
      GROUP BY account_id, batch_id
    ) st ON st.batch_id = pb.id AND st.account_id = pb.account_id
  `;
}

const batchBillableStockSql = "COALESCE(st.qty, 0)::numeric(12, 3)";
const batchFreeStockSql = "COALESCE(st.free_qty, 0)::numeric(12, 3)";
const batchTotalStockSql = `(${batchBillableStockSql} + ${batchFreeStockSql})`;

/** Live ledger stock - use instead of product_batches.current_stock (can be stale). */
const batchLiveBillableColumn = `${batchBillableStockSql} AS current_stock`;
const batchLiveFreeColumn = `${batchFreeStockSql} AS current_free_stock`;

/** Inline subquery for a single batch inside a transaction (params: batchId, accountId). */
const batchLiveStockInlineSql = `
  (
    SELECT COALESCE(SUM(qty), 0)::numeric(12, 3)
    FROM inventory_txns
    WHERE batch_id = $1 AND account_id = $2
  ) AS current_stock,
  (
    SELECT COALESCE(SUM(free_qty), 0)::numeric(12, 3)
    FROM inventory_txns
    WHERE batch_id = $1 AND account_id = $2
  ) AS current_free_stock
`;

/** Product-level total across batches (matches products.list total_quantity). */
function productStockAggregateCte(accountSqlRef) {
  return `
    product_stock AS (
      SELECT
        pb.account_id,
        pb.product_id,
        COALESCE(SUM(${batchTotalStockSql}), 0)::numeric(14, 3) AS total_stock,
        COALESCE(SUM(${batchBillableStockSql}), 0)::numeric(14, 3) AS stock_billable,
        COALESCE(SUM(${batchFreeStockSql}), 0)::numeric(14, 3) AS stock_free
      FROM product_batches pb
      ${batchInventoryStockJoin(accountSqlRef)}
      WHERE pb.deleted_at IS NULL
      GROUP BY pb.account_id, pb.product_id
    )
  `;
}

function productStockAggregateCteAllAccounts() {
  return `
    product_stock AS (
      SELECT
        pb.account_id,
        pb.product_id,
        COALESCE(SUM(${batchTotalStockSql}), 0)::numeric(14, 3) AS total_stock,
        COALESCE(SUM(${batchBillableStockSql}), 0)::numeric(14, 3) AS stock_billable,
        COALESCE(SUM(${batchFreeStockSql}), 0)::numeric(14, 3) AS stock_free
      FROM product_batches pb
      ${batchInventoryStockJoinAllAccounts()}
      WHERE pb.deleted_at IS NULL
      GROUP BY pb.account_id, pb.product_id
    )
  `;
}

module.exports = {
  batchInventoryStockJoin,
  batchInventoryStockJoinAllAccounts,
  batchBillableStockSql,
  batchFreeStockSql,
  batchTotalStockSql,
  batchLiveBillableColumn,
  batchLiveFreeColumn,
  batchLiveStockInlineSql,
  productStockAggregateCte,
  productStockAggregateCteAllAccounts
};
