const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");

/** Format numeric price + period into display strings for the landing page. */
function formatPlan(row) {
  const price = parseFloat(row.price);
  const isFree = row.period === "free" || price === 0;

  const displayPrice = isFree
    ? "Free"
    : "₹" + price.toLocaleString("en-IN", { maximumFractionDigits: 0 });

  const displayPeriod = {
    free:     "14-day trial",
    monthly:  "per month",
    yearly:   "per year",
    one_time: "one time",
  }[row.period] ?? row.period;

  return {
    id:          row.id,
    name:        row.name,
    price:       displayPrice,
    period:      displayPeriod,
    description: row.description,
    features:    row.features,
    highlight:   row.highlight,
    badge:       row.badge,
    cta:         row.cta,
    sort_order:  row.sort_order,
  };
}

/**
 * GET /public/plans
 * No authentication required — returns active pricing plans for the landing page.
 */
async function handler(_event) {
  try {
    const res = await query(
      `select id, name, price, period, description, features,
              highlight, badge, cta, sort_order
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