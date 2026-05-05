/**
 * Indian number formatting utilities (lakh/crore system).
 * 1000      → "1,000"
 * 100000    → "1,00,000"
 * 10000000  → "1,00,00,000"
 * Preserves decimal part as typed.
 */

/**
 * Format a raw numeric string with Indian comma separation.
 * Accepts strings that may already contain commas (strips them first).
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
 * Suitable for read-only display of monetary values.
 * fmtAmt(41415)      → "41,415.00"
 * fmtAmt(100000)     → "1,00,000.00"
 * fmtAmt(100000, 0)  → "1,00,000"
 */
export function fmtAmt(value, decimals = 2) {
  const num = Number(value);
  if (!Number.isFinite(num)) return (0).toFixed(decimals);
  return formatIndianAmount(num.toFixed(decimals));
}

/**
 * Strip all commas to get the raw numeric string suitable for parsing.
 */
export function parseAmount(formatted) {
  return String(formatted ?? "").replace(/,/g, "");
}

/**
 * Handle an onChange event value: strip non-numeric chars (except dot),
 * prevent multiple dots, then return the formatted display string.
 * Use parseAmount() on the result to get the raw value for state.
 */
export function handleAmountInput(raw) {
  // Strip everything except digits and dot
  const stripped = String(raw ?? "").replace(/[^0-9.]/g, "");
  // Prevent multiple decimal points
  const parts = stripped.split(".");
  const clean =
    parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : stripped;
  return formatIndianAmount(clean);
}