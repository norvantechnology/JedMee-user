const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");

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
    return ok({ plans: res.rows });
  } catch (err) {
    console.error("[public/plans]", err);
    return fail(500, "DB_ERROR", "Failed to load pricing plans");
  }
}

module.exports = { handler };