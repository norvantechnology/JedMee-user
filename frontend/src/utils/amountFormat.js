/**
 * Amount input formatting utilities.
 *
 * `formatIndianAmount` / `fmtAmt` / `parseAmount` / `handleAmountInput` are
 * kept for backward compatibility (used by legacy code paths).
 *
 * New code should use `fmtInputAmount` / `parseInputAmount` from currency.js,
 * which are locale-aware and respect the active currency.
 */

import { fmtInputAmount, parseInputAmount } from "./currency.js";

// Re-export locale-aware helpers so callers can migrate gradually.
export { fmtInputAmount, parseInputAmount } from "./currency.js";

// ─── Legacy Indian-format helpers (kept for backward compat) ──────────────

/**
 * Format a raw numeric string with Indian comma separation.
 * 1000      → "1,000"
 * 100000    → "1,00,000"
 * 10000000  → "1,00,00,000"
 * Preserves decimal part as typed.
 *
 * @deprecated Prefer fmtInputAmount() from currency.js for locale-aware formatting.
 */
export function formatIndianAmount(value) {
  const str = String(value ?? "").replace(/,/g, "");
  if (!str || str === ".") return str;

  const dotIdx = str.indexOf(".");
  const intPart = dotIdx >= 0 ? str.slice(0, dotIdx) : str;
  const decPart = dotIdx >= 0 ? str.slice(dotIdx) : "";

  if (!intPart) return decPart;

  // Indian format: last 3 digits, then groups of 2 from the right
  const lastThree = intPart.slice(-3);
  const rest = intPart.slice(0, -3);
  const formatted = rest
    ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + lastThree
    : lastThree;

  return formatted + decPart;
}

/**
 * Format a numeric value for display with Indian comma separation.
 * fmtAmt(41415)      → "41,415.00"
 * fmtAmt(100000)     → "1,00,000.00"
 * fmtAmt(100000, 0)  → "1,00,000"
 *
 * @deprecated Prefer fmtAmount() from currency.js for locale-aware formatting.
 */
export function fmtAmt(value, decimals = 2) {
  const num = Number(value);
  if (!Number.isFinite(num)) return (0).toFixed(decimals);
  return formatIndianAmount(num.toFixed(decimals));
}

/**
 * Strip all commas to get the raw numeric string suitable for parsing.
 *
 * @deprecated Prefer parseInputAmount() from currency.js.
 */
export function parseAmount(formatted) {
  return String(formatted ?? "").replace(/,/g, "");
}

/**
 * Handle an onChange event value: strip non-numeric chars (except dot),
 * prevent multiple dots, then return the Indian-formatted display string.
 * Use parseAmount() on the result to get the raw value for state.
 *
 * @deprecated Prefer handleAmountInputLocale() for locale-aware formatting.
 */
export function handleAmountInput(raw) {
  const stripped = String(raw ?? "").replace(/[^0-9.]/g, "");
  const parts = stripped.split(".");
  const clean =
    parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : stripped;
  return formatIndianAmount(clean);
}

/**
 * Locale-aware version of handleAmountInput.
 * Strips non-numeric chars, prevents multiple dots, then formats using
 * the active currency's locale grouping via fmtInputAmount().
 */
export function handleAmountInputLocale(raw) {
  const stripped = String(raw ?? "").replace(/[^0-9.]/g, "");
  const parts = stripped.split(".");
  const clean =
    parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : stripped;
  return fmtInputAmount(clean);
}