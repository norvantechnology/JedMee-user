/**
 * locale.js
 * Static country catalogue for the JedMee locale/tax system.
 * Mirrors the `countries` DB table - used client-side without an API call
 * so the UI is instantly responsive on first render.
 *
 * Each entry defines:
 *   code          - ISO 3166-1 alpha-2
 *   name          - Display name
 *   flag          - Emoji flag
 *   currencyCode  - ISO 4217 default currency
 *   locale        - BCP 47 locale for Intl formatting
 *   taxSystem     - 'GST' | 'VAT' | 'SALES_TAX' | 'NONE'
 *   taxLabel      - Short label shown in UI ("GST", "VAT", "Sales Tax")
 *   taxIdLabel    - Field label for tax registration number
 *   invoiceLabel  - Invoice document title
 *   phoneCode     - International dialling prefix
 */

export const COUNTRIES = {
  IN: {
    code: "IN",
    name: "India",
    flag: "🇮🇳",
    currencyCode: "INR",
    locale: "en-IN",
    taxSystem: "GST",
    taxLabel: "GST",
    taxIdLabel: "GST Number",
    invoiceLabel: "Tax Invoice",
    phoneCode: "+91",
    taxRates: [0, 5, 12, 18, 28],
    defaultTaxRate: 18,
  },
  US: {
    code: "US",
    name: "United States",
    flag: "🇺🇸",
    currencyCode: "USD",
    locale: "en-US",
    taxSystem: "SALES_TAX",
    taxLabel: "Sales Tax",
    taxIdLabel: "EIN / Tax ID",
    invoiceLabel: "Invoice",
    phoneCode: "+1",
    // Common US state sales-tax rates (0 % – 10 %). No single federal rate.
    taxRates: [0, 4, 5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10],
    defaultTaxRate: 0,
  },
  GB: {
    code: "GB",
    name: "United Kingdom",
    flag: "🇬🇧",
    currencyCode: "GBP",
    locale: "en-GB",
    taxSystem: "VAT",
    taxLabel: "VAT",
    taxIdLabel: "VAT Number",
    invoiceLabel: "VAT Invoice",
    phoneCode: "+44",
    taxRates: [0, 5, 20],
    defaultTaxRate: 20,
  },
  AE: {
    code: "AE",
    name: "UAE",
    flag: "🇦🇪",
    currencyCode: "AED",
    locale: "ar-AE",
    taxSystem: "VAT",
    taxLabel: "VAT",
    taxIdLabel: "TRN",
    invoiceLabel: "Tax Invoice",
    phoneCode: "+971",
    taxRates: [0, 5],
    defaultTaxRate: 5,
  },
  CA: {
    code: "CA",
    name: "Canada",
    flag: "🇨🇦",
    currencyCode: "CAD",
    locale: "en-CA",
    taxSystem: "GST",
    taxLabel: "GST/HST",
    taxIdLabel: "Business No.",
    invoiceLabel: "Invoice",
    phoneCode: "+1",
    // GST 5% is the only truly national rate; HST/PST/QST are province-specific
    taxRates: [0, 5, 7, 9.975, 13, 15],
    defaultTaxRate: 5,
  },
  AU: {
    code: "AU",
    name: "Australia",
    flag: "🇦🇺",
    currencyCode: "AUD",
    locale: "en-AU",
    taxSystem: "GST",
    taxLabel: "GST",
    taxIdLabel: "ABN",
    invoiceLabel: "Tax Invoice",
    phoneCode: "+61",
    taxRates: [0, 10],
    defaultTaxRate: 10,
  },
  DE: {
    code: "DE",
    name: "Germany",
    flag: "🇩🇪",
    currencyCode: "EUR",
    locale: "de-DE",
    taxSystem: "VAT",
    taxLabel: "MwSt.",
    taxIdLabel: "USt-IdNr.",
    invoiceLabel: "Rechnung",
    phoneCode: "+49",
    taxRates: [0, 7, 19],
    defaultTaxRate: 19,
  },
  FR: {
    code: "FR",
    name: "France",
    flag: "🇫🇷",
    currencyCode: "EUR",
    locale: "fr-FR",
    taxSystem: "VAT",
    taxLabel: "TVA",
    taxIdLabel: "SIRET/TVA",
    invoiceLabel: "Facture",
    phoneCode: "+33",
    taxRates: [0, 2.1, 5.5, 10, 20],
    defaultTaxRate: 20,
  },
  SG: {
    code: "SG",
    name: "Singapore",
    flag: "🇸🇬",
    currencyCode: "SGD",
    locale: "en-SG",
    taxSystem: "GST",
    taxLabel: "GST",
    taxIdLabel: "GST Reg. No.",
    invoiceLabel: "Tax Invoice",
    phoneCode: "+65",
    taxRates: [0, 9],
    defaultTaxRate: 9,
  },
  JP: {
    code: "JP",
    name: "Japan",
    flag: "🇯🇵",
    currencyCode: "JPY",
    locale: "ja-JP",
    taxSystem: "VAT",
    taxLabel: "消費税",
    taxIdLabel: "登録番号",
    invoiceLabel: "請求書",
    phoneCode: "+81",
    // 10% standard (Oct 2019); 8% reduced for food/non-alcoholic beverages & newspapers
    taxRates: [0, 8, 10],
    defaultTaxRate: 10,
  },
  SA: {
    code: "SA",
    name: "Saudi Arabia",
    flag: "🇸🇦",
    currencyCode: "SAR",
    locale: "ar-SA",
    taxSystem: "VAT",
    taxLabel: "VAT",
    taxIdLabel: "VAT Number",
    invoiceLabel: "Tax Invoice",
    phoneCode: "+966",
    taxRates: [0, 15],
    defaultTaxRate: 15,
  },
  MY: {
    code: "MY",
    name: "Malaysia",
    flag: "🇲🇾",
    currencyCode: "MYR",
    locale: "ms-MY",
    // Malaysia abolished GST in 2018; now uses SST (Sales & Service Tax)
    taxSystem: "VAT",
    taxLabel: "SST",
    taxIdLabel: "SST No.",
    invoiceLabel: "Invoice",
    phoneCode: "+60",
    // Sales Tax: 5% or 10% on goods; Service Tax: 6% or 8% on services
    taxRates: [0, 5, 6, 8, 10],
    defaultTaxRate: 10,
  },
  CN: {
    code: "CN",
    name: "China",
    flag: "🇨🇳",
    currencyCode: "CNY",
    locale: "zh-CN",
    taxSystem: "VAT",
    taxLabel: "增值税",
    taxIdLabel: "统一社会信用代码",
    invoiceLabel: "发票",
    phoneCode: "+86",
    // 13%: goods (general) | 9%: agriculture/utilities/books | 6%: services/finance
    taxRates: [0, 6, 9, 13],
    defaultTaxRate: 13,
  },
  NZ: {
    code: "NZ",
    name: "New Zealand",
    flag: "🇳🇿",
    currencyCode: "NZD",
    locale: "en-NZ",
    taxSystem: "GST",
    taxLabel: "GST",
    taxIdLabel: "GST Number",
    invoiceLabel: "Tax Invoice",
    phoneCode: "+64",
    // GST 15% since 1 Oct 2010
    taxRates: [0, 15],
    defaultTaxRate: 15,
  },
  ZA: {
    code: "ZA",
    name: "South Africa",
    flag: "🇿🇦",
    currencyCode: "ZAR",
    locale: "en-ZA",
    taxSystem: "VAT",
    taxLabel: "VAT",
    taxIdLabel: "VAT Number",
    invoiceLabel: "Tax Invoice",
    phoneCode: "+27",
    // VAT 15% since 1 Apr 2018; zero-rated: basic food, farming inputs, exports
    taxRates: [0, 15],
    defaultTaxRate: 15,
  },
};

/** Ordered array of all countries (for dropdowns / selectors). */
export const COUNTRY_LIST = Object.values(COUNTRIES);

// ── Module-level active country store ─────────────────────────────────────────
// Kept in sync by LocaleContext; used by non-React utilities.
let _activeCountry = "IN";

export function setActiveCountry(code) {
  if (COUNTRIES[code]) _activeCountry = code;
}

export function getActiveCountry() {
  return _activeCountry;
}

// ── Convenience accessors ─────────────────────────────────────────────────────

export function getCountryConfig(code) {
  return COUNTRIES[code] || COUNTRIES["IN"];
}

export function getTaxLabel(code) {
  return getCountryConfig(code).taxLabel;
}

export function getTaxIdLabel(code) {
  return getCountryConfig(code).taxIdLabel;
}

export function getInvoiceLabel(code) {
  return getCountryConfig(code).invoiceLabel;
}

export function getDefaultCurrency(code) {
  return getCountryConfig(code).currencyCode;
}

export function getTaxRates(code) {
  return getCountryConfig(code).taxRates || [];
}

export function getDefaultTaxRate(code) {
  return getCountryConfig(code).defaultTaxRate ?? 0;
}

/**
 * Returns formatted tax rate options for a <select> dropdown.
 * e.g. [{ label: "GST 18%", value: 18 }, ...]
 */
export function getTaxRateOptions(code) {
  const config = getCountryConfig(code);
  return (config.taxRates || []).map((rate) => ({
    label: rate === 0 ? `${config.taxLabel} Exempt (0%)` : `${config.taxLabel} ${rate}%`,
    value: rate,
    isDefault: rate === config.defaultTaxRate,
  }));
}