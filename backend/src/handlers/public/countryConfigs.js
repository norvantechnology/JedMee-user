const { ok, fail } = require("../../shared/response");
const {
  getAllCountries,
  getCountryConfig,
  getTaxRatesForCountry,
} = require("../../shared/countryTaxConfig");

/**
 * GET /public/country-configs
 * No authentication required.
 * Returns all active countries with their tax configurations and currency codes.
 * Used by the frontend LocaleContext to bootstrap country/tax/currency data.
 *
 * Query params:
 *   ?code=IN          - return a single country config
 *   ?withTaxRates=1   - include formatted tax rate list per country
 */
async function handler(event) {
  try {
    const qs = event.queryStringParameters || {};
    const singleCode = qs.code ? String(qs.code).toUpperCase().trim() : null;
    const withTaxRates = qs.withTaxRates === "1" || qs.withTaxRates === "true";

    if (singleCode) {
      const config = await getCountryConfig(singleCode);
      if (!config) {
        return fail(404, "COUNTRY_NOT_FOUND", `Country '${singleCode}' not found or inactive.`);
      }
      const result = { ...config };
      if (withTaxRates) {
        result.taxRates = await getTaxRatesForCountry(singleCode);
      }
      return ok({ country: result });
    }

    // Return all active countries
    const countries = await getAllCountries();

    let result = countries;
    if (withTaxRates) {
      result = await Promise.all(
        countries.map(async (c) => ({
          ...c,
          taxRates: await getTaxRatesForCountry(c.code),
        }))
      );
    }

    return ok({
      countries: result,
      total: result.length,
    });
  } catch (err) {
    console.error("[public/countryConfigs]", err);
    return fail(500, "INTERNAL_ERROR", "Failed to load country configurations.");
  }
}

module.exports = { handler };