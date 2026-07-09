/**
 * CurrencyContext - React context for the active currency.
 *
 * - Reads initial value from localStorage (key: "jedmee_currency").
 * - Calls setActiveCurrency() from currency.js to keep the module-level
 *   store in sync so non-React code (print templates, CSV exports) also
 *   uses the correct currency.
 * - Exposes useCurrency() hook for components that need the currency code,
 *   symbol, config, or the setCurrency() setter.
 *
 * Usage:
 *   const { code, symbol, config, setCurrency } = useCurrency();
 *   setCurrency("USD");
 */

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  CURRENCIES,
  CURRENCY_LIST,
  getCurrencyConfig,
  setActiveCurrency,
} from "../utils/currency.js";
import { APP_STORAGE_NS } from "../constants/brand.js";

// ─── Storage key ──────────────────────────────────────────────────────────

const STORAGE_KEY = `${APP_STORAGE_NS}_currency`;

function readStoredCurrency() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return CURRENCIES[stored] ? stored : "INR";
  } catch {
    return "INR";
  }
}

function writeStoredCurrency(code) {
  try {
    window.localStorage.setItem(STORAGE_KEY, code);
  } catch {
    /* ignore */
  }
}

// ─── Context ──────────────────────────────────────────────────────────────

const CurrencyContext = createContext(null);

export function CurrencyProvider({ children }) {
  const [code, setCode] = useState(() => {
    const initial = readStoredCurrency();
    // Sync module-level store immediately (before first render)
    setActiveCurrency(initial);
    return initial;
  });

  const setCurrency = useCallback((newCode) => {
    const safe = CURRENCIES[newCode] ? newCode : "INR";
    setActiveCurrency(safe);
    writeStoredCurrency(safe);
    setCode(safe);
  }, []);

  // Keep module-level store in sync whenever code changes
  useEffect(() => {
    setActiveCurrency(code);
  }, [code]);

  const config = getCurrencyConfig(code);

  const value = {
    /** Active currency code, e.g. "INR", "USD" */
    code,
    /** Active currency symbol, e.g. "₹", "$" */
    symbol: config.symbol,
    /** Full config object: { code, symbol, locale, name, decimals } */
    config,
    /** All supported currencies as an ordered array */
    currencies: CURRENCY_LIST,
    /** Change the active currency */
    setCurrency,
  };

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
}

/**
 * Hook to access the active currency and its setter.
 *
 * @returns {{ code: string, symbol: string, config: object, currencies: object[], setCurrency: function }}
 *
 * @example
 *   const { symbol, setCurrency } = useCurrency();
 *   <span>{symbol}1,234.50</span>
 *   <button onClick={() => setCurrency("USD")}>Switch to USD</button>
 */
export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) {
    // Graceful fallback outside provider (e.g. tests, Storybook)
    return {
      code: "INR",
      symbol: "₹",
      config: CURRENCIES.INR,
      currencies: CURRENCY_LIST,
      setCurrency: () => {},
    };
  }
  return ctx;
}