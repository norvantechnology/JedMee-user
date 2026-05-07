/**
 * countryTaxConfig.js
 * Shared service for country-based tax configuration lookups and calculations.
 * Used by invoice, sales, purchase, and reporting handlers.
 */

const { query } = require("./db");

// ── In-memory cache (Lambda warm-start friendly) ──────────────────────────────
let _cache = null;
let _cacheAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function _isCacheValid() {
  return _cache !== null && Date.now() - _cacheAt < CACHE_TTL_MS;
}

function _invalidateCache() {
  _cache = null;
  _cacheAt = 0;
}

// ── Fetch all active countries with their tax configs ─────────────────────────
async function getAllCountries() {
  if (_isCacheValid()) return _cache;

  const { rows } = await query(`
    SELECT
      c.code,
      c.name,
      c.flag_emoji,
      c.currency_code,
      c.locale,
      c.tax_system,
      c.tax_label,
      c.tax_id_label,
      c.invoice_label,
      c.sort_order,
      COALESCE(
        json_agg(
          json_build_object(
            'id',          tc.id,
            'name',        tc.name,
            'rate',        tc.rate,
            'tax_type',    tc.tax_type,
            'is_inclusive',tc.is_inclusive,
            'is_default',  tc.is_default,
            'applies_to',  tc.applies_to,
            'sort_order',  tc.sort_order
          ) ORDER BY tc.sort_order
        ) FILTER (WHERE tc.id IS NOT NULL),
        '[]'
      ) AS tax_configs
    FROM countries c
    LEFT JOIN tax_configs tc
      ON tc.country_code = c.code AND tc.is_active = TRUE
    WHERE c.is_active = TRUE
    GROUP BY c.code, c.name, c.flag_emoji, c.currency_code, c.locale,
             c.tax_system, c.tax_label, c.tax_id_label, c.invoice_label, c.sort_order
    ORDER BY c.sort_order
  `);

  _cache = rows;
  _cacheAt = Date.now();
  return rows;
}

// ── Fetch a single country config ─────────────────────────────────────────────
async function getCountryConfig(countryCode) {
  if (!countryCode) return null;
  const code = String(countryCode).toUpperCase().trim();
  const all = await getAllCountries();
  return all.find((c) => c.code === code) || null;
}

// ── Fetch default tax rate for a country ──────────────────────────────────────
async function getDefaultTaxRate(countryCode) {
  const config = await getCountryConfig(countryCode);
  if (!config) return 0;
  const defaultTax = (config.tax_configs || []).find((t) => t.is_default);
  return defaultTax ? Number(defaultTax.rate) : 0;
}

// ── Fetch region-level tax override ───────────────────────────────────────────
async function getRegionTaxRate(countryCode, regionCode) {
  if (!countryCode || !regionCode) return null;
  const { rows } = await query(
    `SELECT rate_override
     FROM region_tax_rules
     WHERE country_code = $1 AND region_code = $2 AND is_active = TRUE
     LIMIT 1`,
    [String(countryCode).toUpperCase(), String(regionCode).toUpperCase()]
  );
  if (!rows.length || rows[0].rate_override === null) return null;
  return Number(rows[0].rate_override);
}

// ── Tax calculation ───────────────────────────────────────────────────────────
/**
 * Calculate tax for a given amount.
 * @param {number} amount        - Pre-tax amount (or inclusive amount if isInclusive)
 * @param {number} rate          - Tax rate as percentage (e.g. 18 for 18%)
 * @param {boolean} isInclusive  - Whether amount already includes tax
 * @returns {{ taxableAmount, taxAmount, totalAmount, rate }}
 */
function calculateTaxAmount(amount, rate, isInclusive = false) {
  const amt = Number(amount) || 0;
  const r = Number(rate) || 0;

  if (r === 0) {
    return { taxableAmount: amt, taxAmount: 0, totalAmount: amt, rate: 0 };
  }

  if (isInclusive) {
    // Back-calculate: taxable = total / (1 + rate/100)
    const taxable = round4(amt / (1 + r / 100));
    const tax = round4(amt - taxable);
    return { taxableAmount: taxable, taxAmount: tax, totalAmount: amt, rate: r };
  }

  const tax = round4(amt * (r / 100));
  return { taxableAmount: amt, taxAmount: tax, totalAmount: round4(amt + tax), rate: r };
}

/**
 * Full tax calculation with country/region lookup.
 * @param {number} amount
 * @param {string} countryCode
 * @param {string|null} regionCode
 * @param {number|null} rateOverride  - explicit rate (skips DB lookup)
 * @param {boolean} isInclusive
 */
async function calculateTax(amount, countryCode, regionCode = null, rateOverride = null, isInclusive = false) {
  let rate;

  if (rateOverride !== null && rateOverride !== undefined) {
    rate = Number(rateOverride);
  } else if (regionCode) {
    const regionRate = await getRegionTaxRate(countryCode, regionCode);
    rate = regionRate !== null ? regionRate : await getDefaultTaxRate(countryCode);
  } else {
    rate = await getDefaultTaxRate(countryCode);
  }

  const config = await getCountryConfig(countryCode);
  const result = calculateTaxAmount(amount, rate, isInclusive);

  return {
    ...result,
    taxLabel: config ? config.tax_label : "Tax",
    taxSystem: config ? config.tax_system : "NONE",
    countryCode: countryCode || null,
    regionCode: regionCode || null,
  };
}

// ── Validate a tax rate against a country's allowed slabs ─────────────────────
async function isValidTaxRate(countryCode, rate) {
  const config = await getCountryConfig(countryCode);
  if (!config) return false;
  const numRate = Number(rate);
  return (config.tax_configs || []).some((t) => Number(t.rate) === numRate);
}

// ── Get all tax rates for a country (for dropdowns) ───────────────────────────
async function getTaxRatesForCountry(countryCode) {
  const config = await getCountryConfig(countryCode);
  if (!config) return [];
  return (config.tax_configs || []).map((t) => ({
    label: `${config.tax_label} ${t.rate}%`,
    value: Number(t.rate),
    isDefault: t.is_default,
    taxType: t.tax_type,
  }));
}

// ── Utility ───────────────────────────────────────────────────────────────────
function round4(v) {
  return Math.round((Number(v) + Number.EPSILON) * 10000) / 10000;
}

module.exports = {
  getAllCountries,
  getCountryConfig,
  getDefaultTaxRate,
  getRegionTaxRate,
  calculateTaxAmount,
  calculateTax,
  isValidTaxRate,
  getTaxRatesForCountry,
  invalidateCache: _invalidateCache,
};