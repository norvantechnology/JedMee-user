function defaultBatchReportFields(r) {
  return [r.product_name, r.drug_name, r.product_code, r.batch_no, r.mfg_name, r.supplier_name].filter(Boolean);
}

/**
 * Client-side filter for tabular batch reports.
 */
export function filterReportItemsBySearch(items, search, pickFields = defaultBatchReportFields) {
  const q = String(search || "").trim().toLowerCase();
  if (!q) return items;
  return items.filter((r) => pickFields(r).some((s) => String(s).toLowerCase().includes(q)));
}
