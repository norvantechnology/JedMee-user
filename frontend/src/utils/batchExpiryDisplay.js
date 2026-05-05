import { daysUntil } from "./format.js";

/** Whole days until expiry (negative = expired). `null` if date invalid. */
export function batchExpiryDaysRemaining(dateStr) {
  const ymd = String(dateStr || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  return daysUntil(ymd);
}

/** Short label for tables and dropdowns: "45d left", "today", "3d ago". */
export function formatBatchExpiryDaysCompact(dateStr) {
  const d = batchExpiryDaysRemaining(dateStr);
  if (d == null) return "";
  if (d < 0) return `${Math.abs(d)}d ago`;
  if (d === 0) return "today";
  return `${d}d left`;
}

/** Appends compact label: " · 45d left" (empty if invalid). */
export function batchExpiryDaysInlineSuffix(dateStr) {
  const bit = formatBatchExpiryDaysCompact(dateStr);
  return bit ? ` · ${bit}` : "";
}

/** Readable phrase for hints and tooltips. */
export function formatBatchExpiryRelativePhrase(dateStr) {
  const d = batchExpiryDaysRemaining(dateStr);
  if (d == null) return "";
  if (d < 0) {
    const n = Math.abs(d);
    return `Expired ${n} day${n === 1 ? "" : "s"} ago`;
  }
  if (d === 0) return "Expires today";
  return `${d} day${d === 1 ? "" : "s"} left`;
}
