/**
 * LocaleContext — React context for the active country and its tax/locale config.
 *
 * - Reads initial value from localStorage (key: "jedmee_country").
 * - Calls setActiveCountry() from locale.js to keep the module-level store in
 *   sync so non-React utilities (print templates, CSV exports) also use the
 *   correct tax label.
 * - When the country changes, auto-suggests the matching currency via
 *   setCurrency() from CurrencyContext — the user can still override currency
 *   independently afterwards.
 * - Exposes useLocale() hook for components that need tax labels, invoice
 *   terminology, or the country setter.
 *
 * Usage:
 *   const { countryCode, countryConfig, setCountry, taxLabel, taxIdLabel } = useLocale();
 *   setCountry("GB");  // → taxLabel becomes "VAT", currency auto-suggests GBP
 */

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  COUNTRIES,
  COUNTRY_LIST,
  getCountryConfig,
  setActiveCountry,
} from "../utils/locale.js";
import { APP_STORAGE_NS } from "../constants/brand.js";
import { useCurrency } from "./CurrencyContext.jsx";

// ─── Storage key ──────────────────────────────────────────────────────────────

const STORAGE_KEY = `${APP_STORAGE_NS}_country`;

function readStoredCountry() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return COUNTRIES[stored] ? stored : "IN";
  } catch {
    return "IN";
  }
}

function writeStoredCountry(code) {
  try {
    window.localStorage.setItem(STORAGE_KEY, code);
  } catch {
    /* ignore */
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

const LocaleContext = createContext(null);

export function LocaleProvider({ children }) {
  // CurrencyContext must be an ancestor — LocaleProvider is wrapped inside it.
  const { setCurrency } = useCurrency();

  const [countryCode, setCountryCode] = useState(() => {
    const initial = readStoredCountry();
    // Sync module-level store immediately (before first render)
    setActiveCountry(initial);
    return initial;
  });

  /**
   * Change the active country.
   * @param {string} newCode          — ISO 3166-1 alpha-2 (e.g. "GB")
   * @param {boolean} autoSetCurrency — if true (default), also update currency
   *                                    to the country's default currency code.
   */
  const setCountry = useCallback(
    (newCode, autoSetCurrency = true) => {
      const safe = COUNTRIES[newCode] ? newCode : "IN";
      setActiveCountry(safe);
      writeStoredCountry(safe);
      setCountryCode(safe);

      if (autoSetCurrency) {
        const config = getCountryConfig(safe);
        if (config?.currencyCode) {
          setCurrency(config.currencyCode);
        }
      }
    },
    [setCurrency]
  );

  // Keep module-level store in sync whenever countryCode changes
  useEffect(() => {
    setActiveCountry(countryCode);
  }, [countryCode]);

  const countryConfig = getCountryConfig(countryCode);

  const value = {
    /** Active country code, e.g. "IN", "GB" */
    countryCode,
    /** Full country config object from locale.js */
    countryConfig,
    /** All supported countries as an ordered array */
    countries: COUNTRY_LIST,
    /** Change the active country (and optionally auto-set currency) */
    setCountry,

    // ── Convenience shorthands ──────────────────────────────────────────────
    /** Tax label for the active country, e.g. "GST", "VAT", "Sales Tax" */
    taxLabel: countryConfig.taxLabel,
    /** Tax ID field label, e.g. "GST Number", "VAT Number", "Tax ID" */
    taxIdLabel: countryConfig.taxIdLabel,
    /** Invoice document title, e.g. "Tax Invoice", "VAT Invoice", "Invoice" */
    invoiceLabel: countryConfig.invoiceLabel,
    /** Tax system type: 'GST' | 'VAT' | 'SALES_TAX' | 'NONE' */
    taxSystem: countryConfig.taxSystem,
    /** Default tax rate for the active country (percentage) */
    defaultTaxRate: countryConfig.defaultTaxRate ?? 0,
    /** Available tax rates for the active country */
    taxRates: countryConfig.taxRates ?? [],
    /** Country's default currency code */
    defaultCurrencyCode: countryConfig.currencyCode,
    /** International phone dialling prefix */
    phoneCode: countryConfig.phoneCode,
    /** BCP 47 locale string for Intl formatting */
    locale: countryConfig.locale,
  };

  return (
    <LocaleContext.Provider value={value}>
      {children}
    </LocaleContext.Provider>
  );
}

/**
 * Hook to access the active country locale/tax config and its setter.
 *
 * @returns {{
 *   countryCode: string,
 *   countryConfig: object,
 *   countries: object[],
 *   setCountry: function,
 *   taxLabel: string,
 *   taxIdLabel: string,
 *   invoiceLabel: string,
 *   taxSystem: string,
 *   defaultTaxRate: number,
 *   taxRates: number[],
 *   defaultCurrencyCode: string,
 *   phoneCode: string,
 *   locale: string,
 * }}
 *
 * @example
 *   const { taxLabel, setCountry } = useLocale();
 *   <span>{taxLabel} Amount</span>
 *   <button onClick={() => setCountry("GB")}>Switch to UK</button>
 */
export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    // Graceful fallback outside provider (e.g. tests, Storybook)
    const fallback = getCountryConfig("IN");
    return {
      countryCode: "IN",
      countryConfig: fallback,
      countries: COUNTRY_LIST,
      setCountry: () => {},
      taxLabel: fallback.taxLabel,
      taxIdLabel: fallback.taxIdLabel,
      invoiceLabel: fallback.invoiceLabel,
      taxSystem: fallback.taxSystem,
      defaultTaxRate: fallback.defaultTaxRate ?? 0,
      taxRates: fallback.taxRates ?? [],
      defaultCurrencyCode: fallback.currencyCode,
      phoneCode: fallback.phoneCode,
      locale: fallback.locale,
    };
  }
  return ctx;
}