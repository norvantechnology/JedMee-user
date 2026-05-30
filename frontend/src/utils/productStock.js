/** Product-level total stock (matches Quality Master / products list). */
export function productTotalQuantity(row) {
  if (!row) return 0;
  const v =
    row.total_quantity ??
    row.totalQuantity ??
    row.total_stock ??
    row.totalStock ??
    row.current_stock ??
    row.currentStock ??
    row.stock ??
    0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Billable strip qty from batch row (inventory SUM(qty)). */
export function batchBillableQtyFromRow(b) {
  if (!b) return 0;
  if (b.stock_billable_qty != null && b.stock_billable_qty !== "") return Number(b.stock_billable_qty);
  if (b.current_stock != null && b.current_stock !== "") return Number(b.current_stock);
  return Number(b.total_stock ?? 0);
}

/** Free strip qty from batch row (inventory SUM(free_qty)). */
export function batchFreeQtyFromRow(b) {
  if (!b) return 0;
  if (b.stock_free_qty != null && b.stock_free_qty !== "") return Number(b.stock_free_qty);
  if (b.current_free_stock != null && b.current_free_stock !== "") return Number(b.current_free_stock);
  return 0;
}

/** Total units on batch = billable + free (matches product page total_quantity per batch). */
export function batchTotalStock(b) {
  if (!b) return 0;
  if (b.total_stock != null && b.total_stock !== "") return Number(b.total_stock);
  return batchBillableQtyFromRow(b) + batchFreeQtyFromRow(b);
}
