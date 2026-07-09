const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");

/** Map ISO 4217 currency codes to display symbols. */
const CURRENCY_SYMBOLS = {
  USD: "$", EUR: "€", GBP: "£", INR: "₹",
  AUD: "A$", CAD: "C$", SGD: "S$", AED: "AED ",
};

/** Format numeric price + period into display strings for the landing page.
 *  Uses currency_code from the DB row - defaults to USD if absent. */
function formatPlan(row) {
  const price       = parseFloat(row.price);
  const isFree      = row.period === "free" || price === 0;
  const currency    = (row.currency_code || "USD").toUpperCase();
  const sym         = CURRENCY_SYMBOLS[currency] ?? "$";

  const displayPrice = isFree
    ? "Free"
    : sym + price.toLocaleString("en-US", { maximumFractionDigits: 0 });

  const displayPeriod = {
    free:     "14-day trial",
    monthly:  "per month",
    yearly:   "per year",
    one_time: "one time",
  }[row.period] ?? row.period;

  return {
    id:            row.id,
    name:          row.name,
    price:         displayPrice,
    period:        displayPeriod,
    description:   row.description,
    features:      row.features,
    highlight:     row.highlight,
    badge:         row.badge,
    cta:           row.cta,
    sort_order:    row.sort_order,
    currency_code: currency,
  };
}

/**
 * GET /public/plans
 * No authentication required - returns active pricing plans for the landing page.
 */
async function handler(_event) {
  try {
    const res = await query(
      `select id, name, price, period, description, features,
              highlight, badge, cta, sort_order,
              coalesce(currency_code, 'USD') as currency_code
       from pricing_plans
       where is_active = true
       order by sort_order asc, id asc`,
      []
    );
    return ok({ plans: res.rows.map(formatPlan) });
  } catch (err) {
    console.error("[public/plans]", err);
    return fail(500, "DB_ERROR", "Failed to load pricing plans");
  }
}

module.exports = { handler };