/**
 * Multi-currency configuration and formatting utilities.
 *
 * Architecture:
 *  - CURRENCIES map defines all supported currencies with locale, symbol, decimals.
 *  - A module-level `_activeCurrency` store lets non-React code (print templates,
 *    CSV exports, template strings) use the correct currency without prop-drilling.
 *  - CurrencyContext (React) calls setActiveCurrency() to keep the store in sync.
 *  - All formatters accept an optional explicit `code` param; when omitted they
 *    read from the module-level store.
 *
 * Usage:
 *   import { fmtCurrency, fmtAmount, getCurrencySymbol } from "../utils/currency.js";
 *
 *   fmtCurrency(1234.5)          // "₹1,234.50"  (INR active)
 *   fmtCurrency(1234.5, "USD")   // "$1,234.50"
 *   fmtAmount(1234.5)            // "1,234.50"    (no symbol)
 *   getCurrencySymbol()          // "₹"
 */

// ─── Currency catalogue ────────────────────────────────────────────────────

export const CURRENCIES = {
  INR: { code: "INR", symbol: "₹",    locale: "en-IN", name: "Indian Rupee",       decimals: 2 },
  USD: { code: "USD", symbol: "$",    locale: "en-US", name: "US Dollar",           decimals: 2 },
  EUR: { code: "EUR", symbol: "€",    locale: "de-DE", name: "Euro",               decimals: 2 },
  GBP: { code: "GBP", symbol: "£",    locale: "en-GB",  name: "British Pound",      decimals: 2 },
  AED: { code: "AED", symbol: "د.إ",  locale: "ar-AE",  name: "UAE Dirham",         decimals: 2 },
  CAD: { code: "CAD", symbol: "CA$",  locale: "en-CA", name: "Canadian Dollar",     decimals: 2 },
  AUD: { code: "AUD", symbol: "A$",   locale: "en-AU", name: "Australian Dollar",   decimals: 2 },
  SGD: { code: "SGD", symbol: "S$",   locale: "en-SG", name: "Singapore Dollar",    decimals: 2 },
  JPY: { code: "JPY", symbol: "¥",    locale: "ja-JP", name: "Japanese Yen",        decimals: 0 },
  CNY: { code: "CNY", symbol: "¥",    locale: "zh-CN", name: "Chinese Yuan",        decimals: 2 },
  SAR: { code: "SAR", symbol: "SR",   locale: "ar-SA", name: "Saudi Riyal",         decimals: 2 },
  MYR: { code: "MYR", symbol: "RM",   locale: "ms-MY", name: "Malaysian Ringgit",   decimals: 2 },
};

/** Ordered list for dropdowns / selectors. */
export const CURRENCY_LIST = Object.values(CURRENCIES);

// ─── Module-level active currency store ───────────────────────────────────
// Readable by non-React code (print templates, CSV exports, etc.)

let _activeCurrency = "INR";

/**
 * Set the active currency. Called by CurrencyContext on mount and on change.
 * Falls back to INR for unknown codes.
 */
export function setActiveCurrency(code) {
  _activeCurrency = CURRENCIES[code] ? code : "INR";
}

/** Get the currently active currency code (e.g. "INR", "USD"). */
export function getActiveCurrency() {
  return _activeCurrency;
}

// ─── Config helpers ────────────────────────────────────────────────────────

/**
 * Return the full config object for a currency code.
 * Falls back to INR for unknown/missing codes.
 */
export function getCurrencyConfig(code) {
  return CURRENCIES[code ?? _activeCurrency] ?? CURRENCIES.INR;
}

/**
 * Return just the symbol for the active (or specified) currency.
 * getCurrencySymbol()        → "₹"
 * getCurrencySymbol("USD")   → "$"
 */
export function getCurrencySymbol(code) {
  return getCurrencyConfig(code).symbol;
}

// ─── Formatters ────────────────────────────────────────────────────────────

/**
 * Format a numeric value with the active (or specified) currency using
 * Intl.NumberFormat. Returns "" for non-finite input.
 *
 * fmtCurrency(1234.5)          → "₹1,234.50"   (INR active)
 * fmtCurrency(100000)          → "₹1,00,000.00" (INR - Indian grouping)
 * fmtCurrency(1234.5, "USD")   → "$1,234.50"
 * fmtCurrency(null)            → ""
 */
export function fmtCurrency(value, code) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "";
  const cfg = getCurrencyConfig(code);
  try {
    return new Intl.NumberFormat(cfg.locale, {
      style: "currency",
      currency: cfg.code,
      minimumFractionDigits: cfg.decimals,
      maximumFractionDigits: cfg.decimals,
    }).format(num);
  } catch {
    // Fallback: manual symbol + toFixed
    return `${cfg.symbol}${num.toFixed(cfg.decimals)}`;
  }
}

/**
 * Format a numeric value as a plain number (no symbol) using the active
 * currency's locale and decimal settings. Returns "" for non-finite input.
 *
 * fmtAmount(1234.5)          → "1,234.50"    (USD/EUR locale)
 * fmtAmount(100000)          → "1,00,000.00" (INR - Indian grouping)
 * fmtAmount(1234.5, "USD")   → "1,234.50"
 */
export function fmtAmount(value, code) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "";
  const cfg = getCurrencyConfig(code);
  try {
    return new Intl.NumberFormat(cfg.locale, {
      minimumFractionDigits: cfg.decimals,
      maximumFractionDigits: cfg.decimals,
    }).format(num);
  } catch {
    return num.toFixed(cfg.decimals);
  }
}

/**
 * Like fmtCurrency but returns a fallback string instead of "" for invalid input.
 * fmtCurrencySafe(null)        → "-"
 * fmtCurrencySafe(null, "USD", "$0.00") → "$0.00"
 */
export function fmtCurrencySafe(value, code, fallback = "-") {
  const result = fmtCurrency(value, code);
  return result === "" ? fallback : result;
}

/**
 * Format a value as currency, returning a zero-value string for invalid input.
 * Useful for totals that should always show a value.
 * fmtCurrencyOrZero(null)      → "₹0.00"  (INR active)
 */
export function fmtCurrencyOrZero(value, code) {
  const num = Number(value);
  return fmtCurrency(Number.isFinite(num) ? num : 0, code);
}

/**
 * Format a numeric value for input field display using the active currency's
 * locale grouping. Strips the currency symbol - suitable for <input> values.
 *
 * For INR: uses Indian grouping (1,00,000.00)
 * For others: uses standard grouping (100,000.00)
 *
 * Returns "" for empty/null input.
 */
export function fmtInputAmount(raw, code) {
  const str = String(raw ?? "").replace(/,/g, "");
  if (!str || str === ".") return str;

  const cfg = getCurrencyConfig(code);
  const num = Number(str);

  // If the string ends with "." or has trailing zeros after decimal,
  // we must preserve the raw string (user is still typing)
  if (!Number.isFinite(num) || str.endsWith(".")) return str;

  // Preserve trailing decimal zeros while typing (e.g. "1.0", "1.00")
  const dotIdx = str.indexOf(".");
  if (dotIdx >= 0) {
    const decPart = str.slice(dotIdx + 1);
    // User is still typing decimals - format integer part only
    const intNum = Math.trunc(num);
    const intFormatted = new Intl.NumberFormat(cfg.locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(intNum);
    return `${intFormatted}.${decPart}`;
  }

  return new Intl.NumberFormat(cfg.locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

/**
 * Strip locale-specific grouping separators from a formatted amount string,
 * returning a plain numeric string suitable for Number() parsing.
 *
 * Works for both Indian (1,00,000) and standard (100,000) grouping.
 */
export function parseInputAmount(formatted) {
  // Remove all characters that are not digits, minus sign, or decimal point
  return String(formatted ?? "").replace(/[^0-9.\-]/g, "");
}