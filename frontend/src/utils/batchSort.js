/**
 * Sort batches for line-item dropdowns: earliest expiry first (FEFO).
 * Missing / invalid expiry dates sort last.
 */
export function sortBatchesByExpiryAsc(batches) {
  if (!Array.isArray(batches) || !batches.length) return [];
  return [...batches].sort((a, b) => {
    const ea = String(a?.expiry_date ?? "").slice(0, 10);
    const eb = String(b?.expiry_date ?? "").slice(0, 10);
    const validA = /^\d{4}-\d{2}-\d{2}$/.test(ea);
    const validB = /^\d{4}-\d{2}-\d{2}$/.test(eb);
    if (!validA && !validB) {
      return String(a?.batch_no || "").localeCompare(String(b?.batch_no || ""));
    }
    if (!validA) return 1;
    if (!validB) return -1;
    if (ea !== eb) return ea < eb ? -1 : 1;
    return String(a?.batch_no || "").localeCompare(String(b?.batch_no || ""));
  });
}
