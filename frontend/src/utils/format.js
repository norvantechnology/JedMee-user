/*
 * Shared formatting helpers.
 * Keep all currency/date/quantity formatting here so UI, print, and API
 * consumers stay consistent. Do NOT duplicate these in components/pages.
 */

/** Coerce any value to a trimmed string. Replaces the local `clean(v)` helpers in pages. */
export function clean(v) {
  return String(v ?? "").trim();
}

// ─── Currency helpers ──────────────────────────────────────────────────────
// Re-exported from currency.js so existing imports from format.js keep working.
// Prefer importing directly from currency.js in new code.

import { fmtAmount as _fmtAmount } from "./currency.js";

export {
  fmtCurrency,
  fmtCurrencySafe,
  fmtCurrencyOrZero,
  fmtAmount,
  getCurrencySymbol,
  getActiveCurrency,
} from "./currency.js";

/**
 * Two-decimal plain number string using the active currency's locale grouping.
 * Returns "" for non-finite input.
 *
 * Use fmtCurrency() when you need the symbol prefix.
 *
 * fmtMoney(1234.5)   → "1,234.50"    (USD/EUR active)
 * fmtMoney(100000)   → "1,00,000.00" (INR active - Indian grouping)
 */
export function fmtMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return _fmtAmount(n);
}

/**
 * @deprecated Use fmtCurrency() instead.
 * Kept for backward compatibility - delegates to fmtCurrency() so it now
 * respects the active currency rather than always prepending "₹".
 */
export { fmtCurrency as fmtMoneyINR } from "./currency.js";

// ─── Quantity ──────────────────────────────────────────────────────────────

/** Quantity formatter. Integers when whole, up to 3 decimals otherwise. */
export function fmtQty(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  if (Number.isInteger(n)) return String(n);
  return String(Number(n.toFixed(3)));
}

// ─── Date helpers ──────────────────────────────────────────────────────────

/** ISO date → YYYY-MM-DD (first 10 chars). "" for empty/null. */
export function ymd(value) {
  const s = String(value || "").slice(0, 10);
  return s || "";
}

/** Format a date to DD/MM/YYYY. Returns "-" for empty/invalid input. */
export function fmtDateDMY(value) {
  const s = ymd(value);
  if (!s) return "-";
  const [y, m, d] = s.split("-");
  if (!y || !m || !d) return s;
  return `${d}/${m}/${y}`;
}

/** ISO date -> locale short date (e.g., "23 Jan 2023" or "9 May 2026"). */
export function fmtDateIndian(value) {
  const s = ymd(value);
  if (!s) return "-";
  const d = new Date(`${s}T00:00:00`);
  if (!Number.isFinite(d.getTime())) return s;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** Format a date-time string in the user's local timezone (e.g. "9 May 2026, 02:30 pm"). */
export function fmtDateTime(value) {
  if (!value) return "-";
  const s = String(value).trim();
  if (!s) return "-";
  const ms = Date.parse(s);
  if (!Number.isFinite(ms)) return s;
  return new Date(ms).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

/** Alias for created/updated timestamps in list tables. */
export function fmtCreatedAt(value) {
  return fmtDateTime(value);
}

// ─── Misc ──────────────────────────────────────────────────────────────────

/** Left-pad an integer to a given width (default 2). */
export function pad(n, width = 2) {
  return String(n).padStart(width, "0");
}

/** Days between `dateStr` and today (negative if already past). */
export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const ms = Date.parse(String(dateStr));
  if (!Number.isFinite(ms)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(ms);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}
